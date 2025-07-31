/**
 * Global Test Teardown for Targeted Tests
 * Cleans up test environment after all tests complete
 */

module.exports = async () => {
  console.log('🧹 Cleaning up global test environment...');
  
  // Clean up any global resources
  // This could include closing database connections, clearing Redis, etc.
  
  // Close Prisma connections
  try {
    const { prisma } = require('@/lib/prisma');
    if (prisma && typeof prisma.$disconnect === 'function') {
      await prisma.$disconnect();
      console.log('✅ Prisma connection closed');
    }
  } catch (error) {
    console.log('⚠️ No Prisma connection to close');
  }
  
  // Close database connections
  try {
    const { db } = require('@/lib/db');
    if (db && typeof db.$disconnect === 'function') {
      await db.$disconnect();
      console.log('✅ Database connection closed');
    }
  } catch (error) {
    console.log('⚠️ No database connection to close');
  }
  
  // Close any remaining timers
  jest.clearAllTimers();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    console.log('✅ Garbage collection forced');
  }
  
  // Wait for any remaining async operations
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('✅ Global test environment cleanup complete');
};