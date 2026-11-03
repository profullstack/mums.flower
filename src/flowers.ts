/**
 * What flowers mean, and which suit a mom. Meanings follow the common Western
 * (Victorian "floriography") tradition; they vary by culture, so the pages say
 * so. Seasons are Northern Hemisphere.
 */
export interface Flower {
  slug: string;
  name: string;
  emoji: string;
  meaning: string;
  forMom: string;
  colors: string[];
  season: string;
  care: string;
}

export const FLOWERS: Flower[] = [
  { slug: 'carnation', name: 'Carnation', emoji: '🌸', meaning: "A mother's undying love (pink); admiration and gratitude.", forMom: 'The original Mother\'s Day flower: Anna Jarvis handed out white carnations at the first one in 1908.', colors: ['pink', 'white', 'red'], season: 'Year-round', care: 'Cut stems at an angle, change water every two days; lasts up to three weeks.' },
  { slug: 'chrysanthemum', name: 'Chrysanthemum (mum)', emoji: '🌼', meaning: 'Joy, optimism and long life.', forMom: "Literally the 'mum': the traditional Mother's Day flower in Australia, where they bloom in May.", colors: ['yellow', 'white', 'pink', 'bronze', 'red'], season: 'Autumn', care: 'Remove leaves below the waterline; one of the longest-lasting cut flowers.' },
  { slug: 'rose', name: 'Rose', emoji: '🌹', meaning: 'Pink: gratitude and admiration. Yellow: friendship and joy. Red: romantic love (better for a partner).', forMom: 'Pink or peach roses say thank you without saying romance.', colors: ['pink', 'peach', 'yellow', 'white', 'red'], season: 'Late spring to autumn', care: 'Strip lower leaves and thorns, recut stems every few days.' },
  { slug: 'peony', name: 'Peony', emoji: '🌺', meaning: 'Prosperity, honour and a happy life.', forMom: 'Big, generous and in season right around Mother\'s Day.', colors: ['pink', 'white', 'coral', 'burgundy'], season: 'Late spring', care: 'Buy in tight bud; they open fast in warm rooms.' },
  { slug: 'tulip', name: 'Tulip', emoji: '🌷', meaning: 'Perfect love and cheerful new beginnings.', forMom: 'Bright spring colours for a mom who likes simple, modern bunches.', colors: ['pink', 'yellow', 'purple', 'white', 'red'], season: 'Spring', care: 'Tulips keep growing in the vase and bend toward light; trim and turn the vase.' },
  { slug: 'lily', name: 'Lily', emoji: '⚜️', meaning: 'Purity, renewal and motherhood (the Madonna lily).', forMom: 'Elegant and fragrant. Do not send to a home with cats: lilies are deadly to them.', colors: ['white', 'pink', 'orange'], season: 'Summer', care: 'Pull the pollen-laden anthers to avoid stains.' },
  { slug: 'orchid', name: 'Orchid', emoji: '🪻', meaning: 'Love, beauty, refinement and strength.', forMom: 'A potted orchid blooms for months and reblooms, a gift that keeps going.', colors: ['white', 'pink', 'purple'], season: 'Year-round (potted)', care: 'Water with three ice cubes a week; bright, indirect light.' },
  { slug: 'gerbera', name: 'Gerbera daisy', emoji: '🌻', meaning: 'Cheerfulness and innocence.', forMom: 'Pure happiness in a vase; great for a mom with a sense of humour.', colors: ['pink', 'orange', 'yellow', 'red'], season: 'Year-round', care: 'Shallow water only: the hairy stems rot when deep.' },
  { slug: 'sunflower', name: 'Sunflower', emoji: '🌻', meaning: 'Adoration, loyalty and warmth.', forMom: "You are my sunshine, in flower form.", colors: ['yellow'], season: 'Summer', care: 'Heavy heads: use a tall, weighted vase and lots of water.' },
  { slug: 'daisy', name: 'Daisy', emoji: '🌼', meaning: 'Innocence, loyal love and new beginnings.', forMom: 'Simple and sweet, like the bunches kids pick for their moms.', colors: ['white', 'yellow'], season: 'Spring to summer', care: 'Change water daily; they drink a lot.' },
  { slug: 'hydrangea', name: 'Hydrangea', emoji: '💠', meaning: 'Heartfelt gratitude and understanding.', forMom: 'Thank you for understanding me: the right flower after a hard year.', colors: ['blue', 'pink', 'white', 'purple'], season: 'Summer', care: 'They drink through their petals too; mist them, and submerge heads if they wilt.' },
  { slug: 'lilac', name: 'Lilac', emoji: '💜', meaning: 'First love and fond memories.', forMom: 'Smells like childhood gardens: great for a mom who loves nostalgia.', colors: ['purple', 'white'], season: 'Spring', care: 'Split woody stems and use warm water.' },
  { slug: 'iris', name: 'Iris', emoji: '🪻', meaning: 'Faith, hope, wisdom and valour.', forMom: 'For the wise mom whose advice you finally took.', colors: ['purple', 'blue', 'white', 'yellow'], season: 'Spring', care: 'Each stem opens several buds in turn; remove spent blooms.' },
  { slug: 'freesia', name: 'Freesia', emoji: '🌸', meaning: 'Trust, thoughtfulness and friendship.', forMom: 'Thoughtful and very fragrant: for the mom who is also your friend.', colors: ['white', 'yellow', 'pink', 'purple'], season: 'Spring', care: 'Pinch off faded flowers so the upper buds open.' },
  { slug: 'alstroemeria', name: 'Alstroemeria (Peruvian lily)', emoji: '🌺', meaning: 'Devotion, friendship and support.', forMom: 'For the mom who always shows up. Lasts two weeks or more.', colors: ['pink', 'orange', 'purple', 'white'], season: 'Year-round', care: 'Remove leaves below water; very long vase life.' },
  { slug: 'ranunculus', name: 'Ranunculus', emoji: '🌹', meaning: 'Radiant charm: "I am dazzled by you".', forMom: 'Layers of petals for a mom who is a little extra.', colors: ['pink', 'peach', 'white', 'yellow'], season: 'Spring', care: 'Hollow stems: shallow, cool water and frequent changes.' },
  { slug: 'lavender', name: 'Lavender', emoji: '💜', meaning: 'Devotion, serenity and calm.', forMom: 'For a mom who deserves a rest. Dries beautifully.', colors: ['purple'], season: 'Summer', care: 'Hang upside down to dry and it keeps its scent for months.' },
  { slug: 'sweet-pea', name: 'Sweet pea', emoji: '🌸', meaning: 'Blissful pleasure and "thank you for a lovely time".', forMom: 'A thank-you in flower form, with a lovely scent.', colors: ['pink', 'purple', 'white'], season: 'Late spring', care: 'Short vase life (about five days); enjoy them fresh.' },
  { slug: 'gardenia', name: 'Gardenia', emoji: '🤍', meaning: 'Purity, sweetness and secret love.', forMom: 'Heady fragrance; often given as a potted plant.', colors: ['white'], season: 'Summer', care: 'Float single blooms in a bowl; do not touch the petals (they bruise).' },
  { slug: 'magnolia', name: 'Magnolia', emoji: '🤍', meaning: 'Dignity, nobility and a love of nature.', forMom: 'For the dignified matriarch of the family.', colors: ['white', 'pink'], season: 'Spring', care: 'Branches open indoors; recut the woody ends.' },
  { slug: 'forget-me-not', name: 'Forget-me-not', emoji: '💙', meaning: 'True, lasting remembrance.', forMom: 'For remembering a mom who is no longer here, or one far away.', colors: ['blue'], season: 'Spring', care: 'Best as a potted plant or garden seeds.' },
  { slug: 'zinnia', name: 'Zinnia', emoji: '🌸', meaning: 'Thoughts of absent friends; lasting affection.', forMom: 'A cheerful "thinking of you" when you live far from mom.', colors: ['pink', 'orange', 'red', 'yellow'], season: 'Summer', care: 'Easy to grow from seed: a fun gift for a gardening mom.' },
  { slug: 'camellia', name: 'Camellia', emoji: '🌺', meaning: 'Longing and devotion; pink camellias mean "I miss you".', forMom: 'Send pink when you cannot be there in person.', colors: ['pink', 'white', 'red'], season: 'Winter to spring', care: 'Float blooms in water; they drop whole.' },
  { slug: 'baby-breath', name: "Baby's breath", emoji: '🤍', meaning: 'Everlasting love and innocence.', forMom: 'The cloud in almost every bouquet; lovely on its own in a big bunch.', colors: ['white', 'pink'], season: 'Year-round', care: 'Dries perfectly by itself in an empty vase.' },
];

export function getFlower(slug: string): Flower | undefined {
  return FLOWERS.find((f) => f.slug === slug);
}

/** Keep only known flower slugs (cards and moms store slugs). */
export function cleanFlowers(input: unknown, max = 12): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    const slug = String(v).trim().toLowerCase();
    if (getFlower(slug) && !out.includes(slug)) out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}
