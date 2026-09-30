import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { renderHook } from "@testing-library/react";
import { type Mock, describe, expect, it, vi } from "vitest";
import { useCardKeyboardNav } from "../../src/hooks/useCardKeyboardNav";

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

const useNavigateMock = useNavigate as unknown as Mock;

/** A keydown event with only the fields the hook reads */
const keyEvent = (
  fields: Pick<
    KeyboardEvent<HTMLElement>,
    "key" | "preventDefault" | "stopPropagation" | "target" | "currentTarget"
  >
) => fields as KeyboardEvent<HTMLElement>;

describe("useCardKeyboardNav", () => {
  it("navigates on Enter key", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onKeyDown(
      keyEvent({
        key: "Enter",
        preventDefault,
        stopPropagation,
        target: document.body,
        currentTarget: document.body,
      })
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/scene/123");
  });

  it("navigates on Space key", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    result.current.onKeyDown(
      keyEvent({
        key: " ",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: document.body,
        currentTarget: document.body,
      })
    );

    expect(navigate).toHaveBeenCalledWith("/scene/123");
  });

  it("calls onActivate instead of navigate when provided", () => {
    const navigate = vi.fn();
    const onActivate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123", onActivate })
    );

    result.current.onKeyDown(
      keyEvent({
        key: "Enter",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: document.body,
        currentTarget: document.body,
      })
    );

    expect(onActivate).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores key events on input fields", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    const input = document.createElement("input");

    result.current.onKeyDown(
      keyEvent({
        key: "Enter",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: input,
        currentTarget: document.body,
      })
    );

    expect(navigate).not.toHaveBeenCalled();
  });

  it("Enter on a button inside the card activates the button and does not navigate", () => {
    const navigate = vi.fn();
    const onActivate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123", onActivate })
    );

    const card = document.createElement("div");
    const heart = document.createElement("button");
    card.appendChild(heart);
    document.body.appendChild(card);
    heart.focus();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onKeyDown(
      keyEvent({
        key: "Enter",
        preventDefault,
        stopPropagation,
        target: heart,
        currentTarget: card,
      })
    );

    card.remove();

    expect(navigate).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
    // The button keeps its own Enter: the default action is not cancelled
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
