import prisma from "./singleton";

async function main() {
  await prisma.video.upsert({
    where: { path: "/app/media/sample.mp4" },
    update: {},
    create: {
      title: "Sample Video",
      path: "/app/media/sample.mp4",
      thumbnail: "https://via.placeholder.com/400x225.png?text=Sample+Video",
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
