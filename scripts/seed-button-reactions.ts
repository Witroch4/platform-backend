#!/usr/bin/env tsx

/**
 * Script to seed initial button reaction mappings
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_BUTTON_REACTIONS } from '../app/config/button-reaction-mapping';

const prisma = new PrismaClient();

async function seedButtonReactions() {
  console.log('🌱 Seeding button reaction mappings...');

  try {
    // Clear existing mappings
    await prisma.buttonReactionMapping.deleteMany();
    console.log('✅ Cleared existing button reaction mappings');

    // Insert default mappings
    for (const mapping of DEFAULT_BUTTON_REACTIONS) {
      await prisma.buttonReactionMapping.create({
        data: {
          buttonId: mapping.buttonId,
          emoji: mapping.emoji,
          description: mapping.description,
          isActive: true,
        },
      });
      console.log(`✅ Created mapping: ${mapping.buttonId} -> ${mapping.emoji}`);
    }

    console.log(`🎉 Successfully seeded ${DEFAULT_BUTTON_REACTIONS.length} button reaction mappings`);
  } catch (error) {
    console.error('❌ Error seeding button reaction mappings:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
if (require.main === module) {
  seedButtonReactions()
    .then(() => {
      console.log('✅ Button reaction seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Button reaction seeding failed:', error);
      process.exit(1);
    });
}

export { seedButtonReactions };