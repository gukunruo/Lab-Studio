import * as THREE from 'three'

export interface Landmark {
  id: string
  name: { zh: string; en: string }
  lat: number
  lon: number
  description: { zh: string; en: string }
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'statue-of-liberty',
    name: { zh: '自由女神像', en: 'Statue of Liberty' },
    lat: 40.6892,
    lon: -74.0445,
    description: {
      zh: '位于纽约港的巨型新古典主义雕塑，1886 年由法国赠予美国，象征自由与民主。',
      en: 'A colossal neoclassical sculpture in New York Harbor, gifted by France in 1886, symbolizing freedom and democracy.',
    },
  },
  {
    id: 'eiffel-tower',
    name: { zh: '埃菲尔铁塔', en: 'Eiffel Tower' },
    lat: 48.8584,
    lon: 2.2945,
    description: {
      zh: '巴黎的钢铁地标，建于 1889 年世博会，高 330 米，是世界最著名的建筑之一。',
      en: 'An iron lattice tower in Paris, built for the 1889 World\'s Fair, standing 330m tall — one of the world\'s most recognizable landmarks.',
    },
  },
  {
    id: 'great-wall',
    name: { zh: '长城', en: 'Great Wall of China' },
    lat: 40.4319,
    lon: 116.5704,
    description: {
      zh: '横跨中国北方的古代军事防御工程，总长超 2 万公里，历经两千余年修筑。',
      en: 'An ancient series of fortifications across northern China, spanning over 20,000 km and built over more than two millennia.',
    },
  },
  {
    id: 'sydney-opera-house',
    name: { zh: '悉尼歌剧院', en: 'Sydney Opera House' },
    lat: -33.8568,
    lon: 151.2153,
    description: {
      zh: '悉尼港畔的表演艺术中心，贝壳形屋顶闻名于世，1973 年落成，联合国世界遗产。',
      en: 'A performing arts center on Sydney Harbour, famous for its shell-like roofs, opened in 1973 and a UNESCO World Heritage Site.',
    },
  },
  {
    id: 'pyramids-of-giza',
    name: { zh: '吉萨金字塔', en: 'Pyramids of Giza' },
    lat: 29.9792,
    lon: 31.1342,
    description: {
      zh: '古埃及法老的陵墓，建于约 4500 年前，最大的胡夫金字塔高 146 米，古代世界七大奇迹唯一存留者。',
      en: 'Tombs of Egyptian pharaohs built ~4,500 years ago. The Great Pyramid of Khufu stands 146m tall — the only surviving ancient wonder.',
    },
  },
  {
    id: 'taj-mahal',
    name: { zh: '泰姬陵', en: 'Taj Mahal' },
    lat: 27.1751,
    lon: 78.0421,
    description: {
      zh: '阿格拉的白色大理石陵墓，莫卧儿皇帝沙贾汗为爱妃所建，被誉为世界最美建筑之一。',
      en: 'A white marble mausoleum in Agra, commissioned by Mughal emperor Shah Jahan for his wife — widely regarded as the most beautiful building in the world.',
    },
  },
  {
    id: 'christ-the-redeemer',
    name: { zh: '救世基督像', en: 'Christ the Redeemer' },
    lat: -22.9519,
    lon: -43.2105,
    description: {
      zh: '里约热内卢科科瓦多山顶的巨大耶稣雕像，高 38 米，张开双臂俯瞰城市，1931 年落成。',
      en: 'A 38m-tall statue of Jesus atop Corcovado mountain in Rio de Janeiro, arms outstretched over the city, completed in 1931.',
    },
  },
  {
    id: 'big-ben',
    name: { zh: '大本钟', en: 'Big Ben' },
    lat: 51.5007,
    lon: -0.1246,
    description: {
      zh: '伦敦威斯敏斯特宫北端的钟楼，钟声 13.5 吨，是英国最著名的标志性建筑之一。',
      en: 'The clock tower at the north end of the Palace of Westminster in London. Its bell weighs 13.5 tonnes — one of Britain\'s most iconic landmarks.',
    },
  },
]

export function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  return new THREE.Vector3(x, y, z)
}
