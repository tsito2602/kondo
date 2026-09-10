export type Airport = {
  code: string;
  city: string;
  name: string;
  aliases: string[];
};

export const airports: Airport[] = [
  { code: 'HND', city: '東京', name: '羽田空港', aliases: ['羽田', '東京国際空港', 'haneda', 'tokyo'] },
  { code: 'NRT', city: '東京', name: '成田国際空港', aliases: ['成田', 'narita', 'tokyo'] },
  { code: 'KIX', city: '大阪', name: '関西国際空港', aliases: ['関空', '関西空港', 'kansai', 'osaka'] },
  { code: 'ITM', city: '大阪', name: '大阪国際空港（伊丹）', aliases: ['伊丹', '伊丹空港', 'itami', 'osaka'] },
  { code: 'NGO', city: '名古屋', name: '中部国際空港', aliases: ['セントレア', '中部空港', 'centrair', 'nagoya'] },
  { code: 'FUK', city: '福岡', name: '福岡空港', aliases: ['福岡', 'fukuoka'] },
  { code: 'CTS', city: '札幌', name: '新千歳空港', aliases: ['新千歳', '千歳', 'sapporo', 'chitose'] },
  { code: 'OKA', city: '那覇', name: '那覇空港', aliases: ['沖縄', '那覇', 'naha', 'okinawa'] },
  { code: 'VIE', city: 'ウィーン', name: 'ウィーン国際空港', aliases: ['ウィーン', 'vienna', 'schwechat'] },
  { code: 'FRA', city: 'フランクフルト', name: 'フランクフルト空港', aliases: ['フランクフルト', 'frankfurt'] },
  { code: 'STR', city: 'シュトゥットガルト', name: 'シュトゥットガルト空港', aliases: ['シュトゥットガルト', 'stuttgart'] },
  { code: 'MUC', city: 'ミュンヘン', name: 'ミュンヘン空港', aliases: ['ミュンヘン', 'munich', 'münchen'] },
  { code: 'DXB', city: 'ドバイ', name: 'ドバイ国際空港', aliases: ['ドバイ', 'dubai'] },
  { code: 'LHR', city: 'ロンドン', name: 'ロンドン・ヒースロー空港', aliases: ['ヒースロー', 'ロンドン', 'heathrow', 'london'] },
  { code: 'CDG', city: 'パリ', name: 'パリ＝シャルル・ド・ゴール空港', aliases: ['シャルルドゴール', 'パリ', 'paris', 'charles de gaulle'] },
  { code: 'FCO', city: 'ローマ', name: 'ローマ・フィウミチーノ空港', aliases: ['フィウミチーノ', 'ローマ', 'rome', 'fiumicino'] },
  { code: 'AMS', city: 'アムステルダム', name: 'アムステルダム・スキポール空港', aliases: ['スキポール', 'アムステルダム', 'amsterdam', 'schiphol'] },
  { code: 'ZRH', city: 'チューリッヒ', name: 'チューリッヒ空港', aliases: ['チューリヒ', 'チューリッヒ', 'zurich', 'zürich'] },
  { code: 'JFK', city: 'ニューヨーク', name: 'ジョン・F・ケネディ国際空港', aliases: ['ニューヨーク', 'ケネディ', 'new york'] },
  { code: 'LAX', city: 'ロサンゼルス', name: 'ロサンゼルス国際空港', aliases: ['ロサンゼルス', 'los angeles'] },
  { code: 'SFO', city: 'サンフランシスコ', name: 'サンフランシスコ国際空港', aliases: ['サンフランシスコ', 'san francisco'] },
];

function searchable(airport: Airport) {
  return [airport.code, airport.city, airport.name, ...airport.aliases].join(' ').toLocaleLowerCase();
}

export function findAirports(query: string, limit = 6) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return airports
    .filter((airport) => searchable(airport).includes(normalized))
    .sort((a, b) => {
      const aExact = [a.code, a.city, a.name, ...a.aliases].some((value) => value.toLocaleLowerCase() === normalized);
      const bExact = [b.code, b.city, b.name, ...b.aliases].some((value) => value.toLocaleLowerCase() === normalized);
      return Number(bExact) - Number(aExact);
    })
    .slice(0, limit);
}
