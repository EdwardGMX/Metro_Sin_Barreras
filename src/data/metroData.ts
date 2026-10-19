/**
 * Red del Metro de la Ciudad de México usada por el prototipo: 12 líneas y
 * todas sus estaciones en orden. Las coordenadas son aproximadas (latitud,
 * longitud) y solo sirven para dibujar el mapa; en la versión final provienen
 * del conjunto de datos de líneas y estaciones del STC publicado por ADIP.
 */
export type Point = [number, number]

export type MetroLine = {
  id: string
  name: string
  color: string
  textColor: string
  stations: string[]
}

type Def = { id: string; color: string; textColor: string; estaciones: Array<[string, number, number]> }

const DEFS: Def[] = [
  {
    id: "1",
    color: "#e95e8b",
    textColor: "#171717",
    estaciones: [
      ["Observatorio", 19.3985, -99.2003],
      ["Tacubaya", 19.4034, -99.1871],
      ["Juanacatlán", 19.4128, -99.1822],
      ["Chapultepec", 19.4208, -99.1765],
      ["Sevilla", 19.4217, -99.1707],
      ["Insurgentes", 19.4235, -99.163],
      ["Cuauhtémoc", 19.4258, -99.1549],
      ["Balderas", 19.4273, -99.1491],
      ["Salto del Agua", 19.427, -99.1424],
      ["Isabel la Católica", 19.4266, -99.1377],
      ["Pino Suárez", 19.4253, -99.1329],
      ["Merced", 19.4255, -99.1247],
      ["Candelaria", 19.4287, -99.1196],
      ["San Lázaro", 19.4303, -99.1149],
      ["Moctezuma", 19.4272, -99.11],
      ["Balbuena", 19.4229, -99.1029],
      ["Boulevard Puerto Aéreo", 19.4196, -99.0958],
      ["Gómez Farías", 19.4165, -99.0905],
      ["Zaragoza", 19.4122, -99.0825],
      ["Pantitlán", 19.4155, -99.0722],
    ],
  },
  {
    id: "2",
    color: "#1574b8",
    textColor: "#ffffff",
    estaciones: [
      ["Cuatro Caminos", 19.4597, -99.2156],
      ["Panteones", 19.4588, -99.203],
      ["Tacuba", 19.4593, -99.1883],
      ["Cuitláhuac", 19.4573, -99.1815],
      ["Popotla", 19.4528, -99.1753],
      ["Colegio Militar", 19.4493, -99.172],
      ["Normal", 19.4447, -99.1673],
      ["San Cosme", 19.4419, -99.1609],
      ["Revolución", 19.4393, -99.1546],
      ["Hidalgo", 19.4375, -99.1472],
      ["Bellas Artes", 19.4364, -99.1415],
      ["Allende", 19.4356, -99.1374],
      ["Zócalo/Tenochtitlan", 19.4326, -99.1323],
      ["Pino Suárez", 19.4253, -99.1329],
      ["San Antonio Abad", 19.4159, -99.1347],
      ["Chabacano", 19.4089, -99.1356],
      ["Viaducto", 19.4005, -99.1366],
      ["Xola", 19.3951, -99.1378],
      ["Villa de Cortés", 19.3877, -99.1388],
      ["Nativitas", 19.3796, -99.1397],
      ["Portales", 19.3699, -99.1414],
      ["Ermita", 19.3617, -99.1427],
      ["General Anaya", 19.3532, -99.1449],
      ["Tasqueña", 19.344, -99.1428],
    ],
  },
  {
    id: "3",
    color: "#a99829",
    textColor: "#171717",
    estaciones: [
      ["Indios Verdes", 19.4955, -99.1196],
      ["Deportivo 18 de Marzo", 19.4834, -99.1257],
      ["Potrero", 19.4766, -99.1322],
      ["La Raza", 19.4697, -99.1369],
      ["Tlatelolco", 19.4549, -99.1428],
      ["Guerrero", 19.4447, -99.1456],
      ["Hidalgo", 19.4375, -99.1472],
      ["Juárez", 19.4331, -99.1477],
      ["Balderas", 19.4273, -99.1491],
      ["Niños Héroes", 19.4198, -99.1507],
      ["Hospital General", 19.4135, -99.1536],
      ["Centro Médico", 19.4068, -99.1555],
      ["Etiopía/Plaza de la Transparencia", 19.3956, -99.1563],
      ["Eugenia", 19.3855, -99.1574],
      ["División del Norte", 19.3796, -99.159],
      ["Zapata", 19.3708, -99.165],
      ["Coyoacán", 19.3613, -99.1708],
      ["Viveros/Derechos Humanos", 19.3537, -99.1757],
      ["Miguel Ángel de Quevedo", 19.3463, -99.1807],
      ["Copilco", 19.3361, -99.1768],
      ["Universidad", 19.3244, -99.1739],
    ],
  },
  {
    id: "4",
    color: "#67b5a5",
    textColor: "#171717",
    estaciones: [
      ["Martín Carrera", 19.4851, -99.1043],
      ["Talismán", 19.4743, -99.1078],
      ["Bondojito", 19.4645, -99.112],
      ["Consulado", 19.4577, -99.1137],
      ["Canal del Norte", 19.4492, -99.1159],
      ["Morelos", 19.4392, -99.1183],
      ["Candelaria", 19.4287, -99.1196],
      ["Fray Servando", 19.4215, -99.1206],
      ["Jamaica", 19.4091, -99.1222],
      ["Santa Anita", 19.4026, -99.1214],
    ],
  },
  {
    id: "5",
    color: "#f4d03f",
    textColor: "#171717",
    estaciones: [
      ["Politécnico", 19.5007, -99.1491],
      ["Instituto del Petróleo", 19.4893, -99.1449],
      ["Autobuses del Norte", 19.4795, -99.1404],
      ["La Raza", 19.4697, -99.1369],
      ["Misterios", 19.4632, -99.13],
      ["Valle Gómez", 19.4589, -99.1197],
      ["Consulado", 19.4577, -99.1137],
      ["Eduardo Molina", 19.4515, -99.1054],
      ["Aragón", 19.4512, -99.0962],
      ["Oceanía", 19.4455, -99.0871],
      ["Terminal Aérea", 19.4334, -99.088],
      ["Hangares", 19.4241, -99.0876],
      ["Pantitlán", 19.4155, -99.0722],
    ],
  },
  {
    id: "6",
    color: "#d63b35",
    textColor: "#ffffff",
    estaciones: [
      ["El Rosario", 19.5047, -99.2003],
      ["Tezozómoc", 19.4951, -99.1963],
      ["UAM-Azcapotzalco", 19.4908, -99.1862],
      ["Ferrería/Arena Ciudad de México", 19.4908, -99.1741],
      ["Norte 45", 19.4886, -99.1636],
      ["Vallejo", 19.4904, -99.1557],
      ["Instituto del Petróleo", 19.4893, -99.1449],
      ["Lindavista", 19.4875, -99.1345],
      ["Deportivo 18 de Marzo", 19.4834, -99.1257],
      ["La Villa-Basílica", 19.4813, -99.1176],
      ["Martín Carrera", 19.4851, -99.1043],
    ],
  },
  {
    id: "7",
    color: "#e87524",
    textColor: "#171717",
    estaciones: [
      ["El Rosario", 19.5047, -99.2003],
      ["Aquiles Serdán", 19.4904, -99.1946],
      ["Camarones", 19.4793, -99.1897],
      ["Refinería", 19.4703, -99.1902],
      ["Tacuba", 19.4593, -99.1883],
      ["San Joaquín", 19.4459, -99.1916],
      ["Polanco", 19.4334, -99.191],
      ["Auditorio", 19.4253, -99.1921],
      ["Constituyentes", 19.412, -99.1912],
      ["Tacubaya", 19.4034, -99.1871],
      ["San Pedro de los Pinos", 19.3913, -99.1857],
      ["San Antonio", 19.3849, -99.1868],
      ["Mixcoac", 19.3756, -99.1876],
      ["Barranca del Muerto", 19.3611, -99.1897],
    ],
  },
  {
    id: "8",
    color: "#17945b",
    textColor: "#ffffff",
    estaciones: [
      ["Garibaldi", 19.444, -99.1395],
      ["Bellas Artes", 19.4364, -99.1415],
      ["San Juan de Letrán", 19.431, -99.1416],
      ["Salto del Agua", 19.427, -99.1424],
      ["Doctores", 19.421, -99.143],
      ["Obrera", 19.4134, -99.144],
      ["Chabacano", 19.4089, -99.1356],
      ["La Viga", 19.4062, -99.1265],
      ["Santa Anita", 19.4026, -99.1214],
      ["Coyuya", 19.3985, -99.1132],
      ["Iztacalco", 19.3887, -99.1123],
      ["Apatlaco", 19.3793, -99.1094],
      ["Aculco", 19.3739, -99.1076],
      ["Escuadrón 201", 19.3651, -99.1094],
      ["Atlalilco", 19.3561, -99.1012],
      ["Iztapalapa", 19.3578, -99.0932],
      ["Cerro de la Estrella", 19.356, -99.0855],
      ["UAM-I", 19.3509, -99.075],
      ["Constitución de 1917", 19.3458, -99.064],
    ],
  },
  {
    id: "9",
    color: "#74452b",
    textColor: "#ffffff",
    estaciones: [
      ["Tacubaya", 19.4034, -99.1871],
      ["Patriotismo", 19.4061, -99.179],
      ["Chilpancingo", 19.4058, -99.1685],
      ["Centro Médico", 19.4068, -99.1555],
      ["Lázaro Cárdenas", 19.4071, -99.1447],
      ["Chabacano", 19.4089, -99.1356],
      ["Jamaica", 19.4091, -99.1222],
      ["Mixiuhca", 19.4083, -99.1129],
      ["Velódromo", 19.4088, -99.1032],
      ["Ciudad Deportiva", 19.4085, -99.0911],
      ["Puebla", 19.4071, -99.0827],
      ["Pantitlán", 19.4155, -99.0722],
    ],
  },
  {
    id: "A",
    color: "#8e3b85",
    textColor: "#ffffff",
    estaciones: [
      ["Pantitlán", 19.4155, -99.0722],
      ["Agrícola Oriental", 19.4048, -99.0697],
      ["Canal de San Juan", 19.3988, -99.0613],
      ["Tepalcates", 19.3912, -99.0463],
      ["Guelatao", 19.385, -99.0356],
      ["Peñón Viejo", 19.3731, -99.0172],
      ["Acatitla", 19.3646, -99.0058],
      ["Santa Marta", 19.3602, -98.9952],
      ["Los Reyes", 19.359, -98.9769],
      ["La Paz", 19.3506, -98.961],
    ],
  },
  {
    id: "B",
    color: "#888b8d",
    textColor: "#171717",
    estaciones: [
      ["Buenavista", 19.4466, -99.1527],
      ["Guerrero", 19.4447, -99.1456],
      ["Garibaldi", 19.444, -99.1395],
      ["Lagunilla", 19.4433, -99.1313],
      ["Tepito", 19.4428, -99.124],
      ["Morelos", 19.4392, -99.1183],
      ["San Lázaro", 19.4303, -99.1149],
      ["Ricardo Flores Magón", 19.4369, -99.1036],
      ["Romero Rubio", 19.4405, -99.0942],
      ["Oceanía", 19.4455, -99.0871],
      ["Deportivo Oceanía", 19.4508, -99.0796],
      ["Bosque de Aragón", 19.458, -99.0693],
      ["Villa de Aragón", 19.4615, -99.0612],
      ["Nezahualcóyotl", 19.4728, -99.0546],
      ["Impulsora", 19.4857, -99.049],
      ["Río de los Remedios", 19.4907, -99.0464],
      ["Múzquiz", 19.5017, -99.0423],
      ["Ecatepec", 19.5152, -99.036],
      ["Olímpica", 19.5214, -99.0331],
      ["Plaza Aragón", 19.5285, -99.0302],
      ["Ciudad Azteca", 19.5345, -99.0275],
    ],
  },
  {
    id: "12",
    color: "#b59a37",
    textColor: "#171717",
    estaciones: [
      ["Mixcoac", 19.3756, -99.1876],
      ["Insurgentes Sur", 19.3735, -99.1789],
      ["Hospital 20 de Noviembre", 19.372, -99.1706],
      ["Zapata", 19.3708, -99.165],
      ["Parque de los Venados", 19.3707, -99.1588],
      ["Eje Central", 19.3613, -99.1517],
      ["Ermita", 19.3617, -99.1427],
      ["Mexicaltzingo", 19.3577, -99.1219],
      ["Atlalilco", 19.3561, -99.1012],
      ["Culhuacán", 19.3367, -99.1086],
      ["San Andrés Tomatlán", 19.3285, -99.1046],
      ["Lomas Estrella", 19.3218, -99.0958],
      ["Calle 11", 19.32, -99.0858],
      ["Periférico Oriente", 19.3175, -99.0743],
      ["Tezonco", 19.3062, -99.0653],
      ["Olivos", 19.3043, -99.0594],
      ["Nopalera", 19.3001, -99.0464],
      ["Zapotitlán", 19.2967, -99.0344],
      ["Tlaltenco", 19.2943, -99.024],
      ["Tláhuac", 19.2862, -99.0143],
    ],
  },
]

export const metroLines: MetroLine[] = DEFS.map((d) => ({
  id: d.id,
  name: `Línea ${d.id}`,
  color: d.color,
  textColor: d.textColor,
  stations: d.estaciones.map(([n]) => n),
}))

/** Coordenadas geográficas aproximadas [latitud, longitud] por estación. */
export const stationGeo: Record<string, Point> = Object.fromEntries(
  DEFS.flatMap((d) => d.estaciones.map(([n, lat, lon]) => [n, [lat, lon] as Point])),
)

export function getLine(id: string) {
  return metroLines.find((line) => line.id === id) ?? metroLines[0]
}

/** Líneas que atienden una estación (según el catálogo del prototipo). */
export function linesAtStation(station: string): string[] {
  return metroLines.filter((line) => line.stations.includes(station)).map((line) => line.id)
}

/** Lista única de estaciones físicas, ordenada alfabéticamente. */
export const allStations: string[] = Array.from(new Set(metroLines.flatMap((line) => line.stations))).sort((a, b) =>
  a.localeCompare(b, "es"),
)

/** Estaciones donde se cruzan dos o más líneas. */
export const transferStations: string[] = allStations.filter((s) => linesAtStation(s).length > 1)

/**
 * Proyección equirrectangular local a unidades del mapa (1 unidad ≈ 11 m).
 * El eje y crece hacia el sur, como en SVG.
 */
const LAT0 = 19.42
const K = 10000
export function project([lat, lon]: Point): Point {
  return [(lon + 99.2) * K * Math.cos((LAT0 * Math.PI) / 180), (19.54 - lat) * K]
}

export const stationXY: Record<string, Point> = Object.fromEntries(
  Object.entries(stationGeo).map(([n, p]) => [n, project(p)]),
)

/** Límites de la red en unidades del mapa. */
export const networkBounds = (() => {
  const xs = Object.values(stationXY).map((p) => p[0])
  const ys = Object.values(stationXY).map((p) => p[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
})()

/** Texto sin acentos y en minúsculas, para buscar estaciones. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}
