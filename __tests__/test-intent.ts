import { getPrismaInstance } from "@/lib/connections";

const prisma = getPrismaInstance();

async function testIntent() {
  try {
    console.log('Testing Intent model...');
    
    // Try to create a simple intent
    const intent = await prisma.intent.create({
      data: {
        name: 'test_intent',
        description: 'Test intent',
        actionType: 'TEMPLATE_RESPONSE',
        embedding: `[${Array(1536).fill(0).join(',')}]`,
        similarityThreshold: 0.8,
      },
    });
    
    console.log('Intent created successfully:', intent);
    
    // Clean up
    await prisma.intent.delete({
      where: { id: intent.id }
    });
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing Intent model:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testIntent();