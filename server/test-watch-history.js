import prisma from './prisma/singleton.js';

async function test() {
  try {
    console.log('Testing watchHistory query...');

    const result = await prisma.watchHistory.findUnique({
      where: { userId_sceneId: { userId: 1, sceneId: '14683' } },
    });

    console.log('Result:', result);
  } catch (error) {
    console.error('Full error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

test();
