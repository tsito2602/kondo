export type Airport = {
  code: string;
  city: string;
  name: string;
  aliases: string[];
  timeZone: string;
};

export const airports: Airport[] = [
  { code: 'HND', city: '東京', name: '羽田空港', aliases: ['羽田', '東京国際空港', 'haneda', 'tokyo'], timeZone: 'Asia/Tokyo' },
  { code: 'NRT', city: '東京', name: '成田国際空港', aliases: ['成田', 'narita', 'tokyo'], timeZone: 'Asia/Tokyo' },
  { code: 'KIX', city: '大阪', name: '関西国際空港', aliases: ['関空', '関西空港', 'kansai', 'osaka'], timeZone: 'Asia/Tokyo' },
  { code: 'ITM', city: '大阪', name: '大阪国際空港（伊丹）', aliases: ['伊丹', '伊丹空港', 'itami', 'osaka'], timeZone: 'Asia/Tokyo' },
  { code: 'NGO', city: '名古屋', name: '中部国際空港', aliases: ['セントレア', '中部空港', 'centrair', 'nagoya'], timeZone: 'Asia/Tokyo' },
  { code: 'FUK', city: '福岡', name: '福岡空港', aliases: ['福岡', 'fukuoka'], timeZone: 'Asia/Tokyo' },
  { code: 'CTS', city: '札幌', name: '新千歳空港', aliases: ['新千歳', '千歳', 'sapporo', 'chitose'], timeZone: 'Asia/Tokyo' },
  { code: 'OKA', city: '那覇', name: '那覇空港', aliases: ['沖縄', '那覇', 'naha', 'okinawa'], timeZone: 'Asia/Tokyo' },
  { code: 'VIE', city: 'ウィーン', name: 'ウィーン国際空港', aliases: ['ウィーン', 'vienna', 'schwechat'], timeZone: 'Europe/Vienna' },
  { code: 'FRA', city: 'フランクフルト', name: 'フランクフルト空港', aliases: ['フランクフルト', 'frankfurt'], timeZone: 'Europe/Berlin' },
  { code: 'STR', city: 'シュトゥットガルト', name: 'シュトゥットガルト空港', aliases: ['シュトゥットガルト', 'stuttgart'], timeZone: 'Europe/Berlin' },
  { code: 'MUC', city: 'ミュンヘン', name: 'ミュンヘン空港', aliases: ['ミュンヘン', 'munich', 'münchen'], timeZone: 'Europe/Berlin' },
  { code: 'DXB', city: 'ドバイ', name: 'ドバイ国際空港', aliases: ['ドバイ', 'dubai'], timeZone: 'Asia/Dubai' },
  { code: 'LHR', city: 'ロンドン', name: 'ロンドン・ヒースロー空港', aliases: ['ヒースロー', 'ロンドン', 'heathrow', 'london'], timeZone: 'Europe/London' },
  { code: 'CDG', city: 'パリ', name: 'パリ＝シャルル・ド・ゴール空港', aliases: ['シャルルドゴール', 'パリ', 'paris', 'charles de gaulle'], timeZone: 'Europe/Paris' },
  { code: 'FCO', city: 'ローマ', name: 'ローマ・フィウミチーノ空港', aliases: ['フィウミチーノ', 'ローマ', 'rome', 'fiumicino'], timeZone: 'Europe/Rome' },
  { code: 'AMS', city: 'アムステルダム', name: 'アムステルダム・スキポール空港', aliases: ['スキポール', 'アムステルダム', 'amsterdam', 'schiphol'], timeZone: 'Europe/Amsterdam' },
  { code: 'ZRH', city: 'チューリッヒ', name: 'チューリッヒ空港', aliases: ['チューリヒ', 'チューリッヒ', 'zurich', 'zürich'], timeZone: 'Europe/Zurich' },
  { code: 'JFK', city: 'ニューヨーク', name: 'ジョン・F・ケネディ国際空港', aliases: ['ニューヨーク', 'ケネディ', 'new york'], timeZone: 'America/New_York' },
  { code: 'LAX', city: 'ロサンゼルス', name: 'ロサンゼルス国際空港', aliases: ['ロサンゼルス', 'los angeles'], timeZone: 'America/Los_Angeles' },
  { code: 'SFO', city: 'サンフランシスコ', name: 'サンフランシスコ国際空港', aliases: ['サンフランシスコ', 'san francisco'], timeZone: 'America/Los_Angeles' },
];

export function findAirportByCode(code: string) {
  return airports.find((airport) => airport.code === code.trim().toUpperCase());
}

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
