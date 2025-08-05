#!/usr/bin/env tsx

/**
 * Script to seed initial button reaction mappings
 */

import { getPrismaInstance } from "@/lib/connections";
import { DEFAULT_BUTTON_REACTIONS } from '../app/config/button-reaction-mapping';

const prisma = getPrismaInstance();

async function seedButtonReactions() {
  console.log('🌱 Seeding button reaction mappings...');

  try {
    // Clear existing mappings
    await prisma.mapeamentoBotao.deleteMany();
    console.log('✅ Cleared existing button reaction mappings');

    // Insert default mappings
    for (const mapping of DEFAULT_BUTTON_REACTIONS) {
      const actionPayload = {
        emoji: mapping.emoji || null,
        textReaction: mapping.textReaction || null,
      };
      
      await prisma.mapeamentoBotao.create({
        data: {
          buttonId: mapping.buttonId,
          actionType: 'SEND_TEMPLATE',
          actionPayload,
          description: mapping.description,
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