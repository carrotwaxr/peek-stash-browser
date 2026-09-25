/**
 * Records the statements code sends while it runs, on the main Prisma client
 * and on the clients of the interactive transactions it opens, with how many
 * were in flight at once.
 *
 * `vi.spyOn` cannot wrap Prisma's client proxy (it finds no property
 * descriptor and installs a stub that swallows the call), so the wrappers go
 * on by hand and `restore()` puts the originals back. A transaction's client
 * reads its raw SQL methods from the main client, calling them with itself
 * as `this`: the wrappers keep that `this` (a wrapper bound to the main
 * client would send the transaction's statements outside it) and tell the
 * two apart by it. Its model delegates are its own, so they are recorded
 * through a Proxy handed to the transaction's callback.
 *
 * While it records, a raw statement is a plain promise that runs at once, so
 * a `dbWriteBatch` of them would not be one transaction: record code that
 * sends statements one at a time.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../../prisma/singleton.js";

/** One statement: its SQL, or `<model>.<method>` for a model call. */
export interface RecordedStatement {
  sql: string;
  /** Sent on an interactive transaction's client */
  inTransaction: boolean;
}

export interface StatementRecorder {
  readonly statements: RecordedStatement[];
  /** Interactive transactions opened */
  transactions(): number;
  /** The most statements in flight at once, on any client */
  maxInFlight(): number;
  /** Whether an interactive transaction is open now */
  inTransaction(): boolean;
  restore(): void;
}

const RAW_METHODS = ["$executeRawUnsafe", "$queryRawUnsafe"] as const;

/** The model calls to record besides raw SQL: model -> its methods. */
export type RecordedModels = Partial<
  Record<"stashClip", ReadonlyArray<"findMany" | "upsert">>
>;

/** An interactive transaction's callback and options, as Prisma takes them. */
type TransactionCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;
interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

export function recordStatements(
  models: RecordedModels = {}
): StatementRecorder {
  const statements: RecordedStatement[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let open = 0;
  let transactions = 0;

  const track = async (
    sql: string,
    inTransaction: boolean,
    run: () => unknown
  ): Promise<unknown> => {
    statements.push({ sql, inTransaction });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      return await run();
    } finally {
      inFlight--;
    }
  };

  /** A wrapper recording each call of `method`, run with the caller's `this`. */
  const recording = (
    name: (sql: unknown) => string,
    method: unknown,
    inTransaction: (self: unknown) => boolean
  ) =>
    function (this: unknown, ...args: unknown[]): Promise<unknown> {
      if (typeof method !== "function") {
        return Promise.reject(new Error("not a method"));
      }
      return track(name(args[0]), inTransaction(this), () =>
        Reflect.apply(method, this, args)
      );
    };

  const restores: Array<() => void> = [];

  // Raw SQL, on the main client and, through it, on every transaction's
  for (const name of RAW_METHODS) {
    const original: unknown = Reflect.get(prisma, name);
    Reflect.set(
      prisma,
      name,
      recording(
        (sql) => String(sql),
        original,
        (self) => self !== prisma
      )
    );
    restores.push(() => Reflect.set(prisma, name, original));
  }

  // The main client's model calls
  for (const [model, methods] of Object.entries(models)) {
    const delegate: object = prisma[model as keyof RecordedModels];
    for (const method of methods) {
      const original: unknown = Reflect.get(delegate, method);
      Reflect.set(
        delegate,
        method,
        recording(
          () => `${model}.${method}`,
          original,
          () => false
        )
      );
      restores.push(() => Reflect.set(delegate, method, original));
    }
  }

  /** A transaction's client whose recorded models are tracked. */
  const recordingTx = (
    tx: Prisma.TransactionClient
  ): Prisma.TransactionClient =>
    new Proxy(tx, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target);
        const methods =
          typeof prop === "string"
            ? models[prop as keyof RecordedModels]
            : undefined;
        if (!methods || typeof value !== "object" || value === null) {
          return value;
        }
        return new Proxy(value, {
          get(delegate, method) {
            const original: unknown = Reflect.get(delegate, method, delegate);
            return typeof method === "string" &&
              (methods as readonly string[]).includes(method)
              ? recording(
                  () => `${String(prop)}.${method}`,
                  original,
                  () => true
                ).bind(delegate)
              : original;
          },
        });
      },
    });

  // Interactive transactions count, and hand their callback the recording
  // client; the array form (statements already built) passes through
  const originalTransaction: unknown = Reflect.get(prisma, "$transaction");
  const transaction = prisma.$transaction.bind(prisma);
  Reflect.set(
    prisma,
    "$transaction",
    (
      arg: Prisma.PrismaPromise<unknown>[] | TransactionCallback,
      options?: TransactionOptions
    ) => {
      if (Array.isArray(arg)) return transaction(arg, options);
      transactions++;
      return transaction(async (tx) => {
        open++;
        try {
          return await arg(recordingTx(tx));
        } finally {
          open--;
        }
      }, options);
    }
  );
  restores.push(() => Reflect.set(prisma, "$transaction", originalTransaction));

  return {
    statements,
    transactions: () => transactions,
    maxInFlight: () => maxInFlight,
    inTransaction: () => open > 0,
    restore() {
      for (const undo of restores.reverse()) undo();
    },
  };
}
