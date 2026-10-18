import { GAME_GENRES } from '../constants/gameGenres.js';
import { GAME_PLATFORMS } from '../constants/gamePlatforms.js';
import { POPULAR_TAGS } from '../constants/popularTags.js';
import { GamePlatform } from '../models/GamePlatform.js';
import { GameTag } from '../models/GameTag.js';
import { PopularTag } from '../models/PopularTag.js';

async function seedOptions(Model, names) {
  await Model.bulkWrite(names.map((name, sortOrder) => ({
    updateOne: {
      filter: { name },
      update: { $setOnInsert: { name, sortOrder } },
      upsert: true
    }
  })), { ordered: true });
}

export async function seedCatalogs() {
  await Promise.all([GameTag.init(), GamePlatform.init(), PopularTag.init()]);
  await seedOptions(GameTag, GAME_GENRES);
  await seedOptions(GamePlatform, GAME_PLATFORMS);
  await seedOptions(PopularTag, POPULAR_TAGS);
}
