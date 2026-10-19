export type Point = [number, number]

export type MetroLine = {
  id: string
  name: string
  color: string
  textColor: string
  stations: string[]
  points: Point[]
}

export const metroLines: MetroLine[] = [
  {
    id: "1",
    name: "Línea 1",
    color: "#e95e8b",
    textColor: "#171717",
    stations: [
      "Observatorio",
      "Tacubaya",
      "Chapultepec",
      "Insurgentes",
      "Balderas",
      "Salto del Agua",
      "Pino Suárez",
      "Candelaria",
      "San Lázaro",
      "Pantitlán",
    ],
    points: [
      [55, 105],
      [170, 105],
      [255, 130],
      [365, 130],
      [455, 102],
      [690, 102],
    ],
  },
  {
    id: "2",
    name: "Línea 2",
    color: "#1574b8",
    textColor: "#ffffff",
    stations: [
      "Cuatro Caminos",
      "Panteones",
      "Tacuba",
      "Normal",
      "Hidalgo",
      "Bellas Artes",
      "Pino Suárez",
      "Chabacano",
      "Ermita",
      "Tasqueña",
    ],
    points: [
      [115, 30],
      [150, 95],
      [225, 150],
      [310, 190],
      [395, 238],
      [455, 315],
      [505, 430],
    ],
  },
  {
    id: "3",
    name: "Línea 3",
    color: "#a99829",
    textColor: "#171717",
    stations: [
      "Indios Verdes",
      "Deportivo 18 de Marzo",
      "La Raza",
      "Guerrero",
      "Hidalgo",
      "Balderas",
      "Centro Médico",
      "Zapata",
      "Coyoacán",
      "Miguel Ángel de Quevedo",
      "Universidad",
    ],
    points: [
      [645, 32],
      [575, 80],
      [510, 130],
      [450, 180],
      [390, 238],
      [320, 300],
      [245, 355],
      [150, 430],
    ],
  },
  {
    id: "4",
    name: "Línea 4",
    color: "#67b5a5",
    textColor: "#171717",
    stations: [
      "Martín Carrera",
      "Talismán",
      "Consulado",
      "Canal del Norte",
      "Morelos",
      "Candelaria",
      "Jamaica",
      "Santa Anita",
    ],
    points: [
      [600, 55],
      [565, 125],
      [550, 190],
      [555, 265],
      [575, 350],
      [600, 425],
    ],
  },
  {
    id: "5",
    name: "Línea 5",
    color: "#f4d03f",
    textColor: "#171717",
    stations: [
      "Politécnico",
      "Instituto del Petróleo",
      "La Raza",
      "Misterios",
      "Consulado",
      "Oceanía",
      "Terminal Aérea",
      "Pantitlán",
    ],
    points: [
      [285, 32],
      [350, 65],
      [430, 88],
      [510, 130],
      [590, 150],
      [665, 190],
      [700, 250],
    ],
  },
  {
    id: "6",
    name: "Línea 6",
    color: "#d63b35",
    textColor: "#ffffff",
    stations: [
      "El Rosario",
      "Tezozómoc",
      "Azcapotzalco",
      "Instituto del Petróleo",
      "Deportivo 18 de Marzo",
      "La Villa-Basílica",
      "Martín Carrera",
    ],
    points: [
      [55, 48],
      [145, 48],
      [240, 55],
      [340, 65],
      [450, 62],
      [600, 55],
    ],
  },
  {
    id: "7",
    name: "Línea 7",
    color: "#e87524",
    textColor: "#171717",
    stations: [
      "El Rosario",
      "Aquiles Serdán",
      "Tacuba",
      "Polanco",
      "Auditorio",
      "Tacubaya",
      "Mixcoac",
      "Barranca del Muerto",
    ],
    points: [
      [72, 48],
      [80, 120],
      [92, 200],
      [88, 280],
      [78, 360],
      [95, 435],
    ],
  },
  {
    id: "8",
    name: "Línea 8",
    color: "#17945b",
    textColor: "#ffffff",
    stations: [
      "Garibaldi",
      "Bellas Artes",
      "San Juan de Letrán",
      "Salto del Agua",
      "Chabacano",
      "Santa Anita",
      "Iztacalco",
      "Constitución de 1917",
    ],
    points: [
      [360, 175],
      [390, 225],
      [430, 270],
      [485, 320],
      [555, 365],
      [680, 420],
    ],
  },
  {
    id: "9",
    name: "Línea 9",
    color: "#74452b",
    textColor: "#ffffff",
    stations: [
      "Tacubaya",
      "Patriotismo",
      "Chilpancingo",
      "Centro Médico",
      "Lázaro Cárdenas",
      "Chabacano",
      "Jamaica",
      "Velódromo",
      "Pantitlán",
    ],
    points: [
      [82, 285],
      [170, 290],
      [260, 300],
      [350, 315],
      [445, 325],
      [540, 315],
      [700, 270],
    ],
  },
  {
    id: "A",
    name: "Línea A",
    color: "#8e3b85",
    textColor: "#ffffff",
    stations: [
      "Pantitlán",
      "Agrícola Oriental",
      "Canal de San Juan",
      "Tepalcates",
      "Guelatao",
      "Peñón Viejo",
      "Acatitla",
      "Santa Marta",
      "La Paz",
    ],
    points: [
      [690, 270],
      [650, 320],
      [625, 365],
      [640, 420],
      [735, 445],
    ],
  },
  {
    id: "B",
    name: "Línea B",
    color: "#888b8d",
    textColor: "#171717",
    stations: [
      "Buenavista",
      "Guerrero",
      "Garibaldi",
      "Morelos",
      "San Lázaro",
      "Oceanía",
      "Deportivo Oceanía",
      "Villa de Aragón",
      "Ciudad Azteca",
    ],
    points: [
      [260, 165],
      [350, 175],
      [445, 185],
      [535, 195],
      [625, 175],
      [735, 135],
    ],
  },
  {
    id: "12",
    name: "Línea 12",
    color: "#b59a37",
    textColor: "#171717",
    stations: [
      "Mixcoac",
      "Insurgentes Sur",
      "Hospital 20 de Noviembre",
      "Zapata",
      "Parque de los Venados",
      "Eje Central",
      "Ermita",
      "Atlalilco",
      "Tláhuac",
    ],
    points: [
      [105, 382],
      [190, 390],
      [280, 388],
      [370, 400],
      [470, 410],
      [570, 415],
      [720, 395],
    ],
  },
]

export function getLine(id: string) {
  return metroLines.find((line) => line.id === id) ?? metroLines[0]
}

export function pointForStation(line: MetroLine, station: string): Point {
  const stationIndex = Math.max(line.stations.indexOf(station), 0)
  const progress =
    line.stations.length > 1 ? stationIndex / (line.stations.length - 1) : 0
  const segmentProgress = progress * (line.points.length - 1)
  const segment = Math.min(Math.floor(segmentProgress), line.points.length - 2)
  const localProgress = segmentProgress - segment
  const start = line.points[segment]
  const end = line.points[segment + 1]

  return [
    start[0] + (end[0] - start[0]) * localProgress,
    start[1] + (end[1] - start[1]) * localProgress,
  ]
}

export const transferConnections: Array<{ station: string; lines: string[] }> = [
  { station: "Tacubaya", lines: ["1", "7", "9"] },
  { station: "Balderas", lines: ["1", "3"] },
  { station: "Salto del Agua", lines: ["1", "8"] },
  { station: "Pino Suárez", lines: ["1", "2"] },
  { station: "Candelaria", lines: ["1", "4"] },
  { station: "San Lázaro", lines: ["1", "B"] },
  { station: "Pantitlán", lines: ["1", "5", "9", "A"] },
  { station: "Tacuba", lines: ["2", "7"] },
  { station: "Hidalgo", lines: ["2", "3"] },
  { station: "Bellas Artes", lines: ["2", "8"] },
  { station: "Chabacano", lines: ["2", "8", "9"] },
  { station: "Ermita", lines: ["2", "12"] },
  { station: "Deportivo 18 de Marzo", lines: ["3", "6"] },
  { station: "La Raza", lines: ["3", "5"] },
  { station: "Guerrero", lines: ["3", "B"] },
  { station: "Centro Médico", lines: ["3", "9"] },
  { station: "Zapata", lines: ["3", "12"] },
  { station: "Martín Carrera", lines: ["4", "6"] },
  { station: "Consulado", lines: ["4", "5"] },
  { station: "Morelos", lines: ["4", "B"] },
  { station: "Jamaica", lines: ["4", "9"] },
  { station: "Santa Anita", lines: ["4", "8"] },
  { station: "Instituto del Petróleo", lines: ["5", "6"] },
  { station: "Oceanía", lines: ["5", "B"] },
  { station: "El Rosario", lines: ["6", "7"] },
  { station: "Mixcoac", lines: ["7", "12"] },
  { station: "Garibaldi", lines: ["8", "B"] },
  { station: "Atlalilco", lines: ["8", "12"] },
]

/** Líneas que atienden una estación (según el catálogo del prototipo). */
export function linesAtStation(station: string): string[] {
  return metroLines.filter((line) => line.stations.includes(station)).map((line) => line.id)
}

/** Lista única de estaciones físicas, ordenada alfabéticamente. */
export const allStations: string[] = Array.from(
  new Set(metroLines.flatMap((line) => line.stations)),
).sort((a, b) => a.localeCompare(b, "es"))
