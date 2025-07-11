import axios from "axios";

// Ladas por estado proporcionadas
const ladaPorEstado: Record<string, string[]> = {
  "Aguascalientes": ["449","458","465","495","496"],
  "Baja California": ["616","646","653","658","661","663","664","665","686"],
  "Baja California Sur": ["612","613","615","624"],
  "Campeche": ["913","938","981","982","983","996"],
  "Chiapas": ["916","917","918","919","932","934","961","962","963","964","965","966","967","968","992","994"],
  "Chihuahua": ["614","621","625","626","627","628","629","635","636","639","648","649","652","656","657","659"],
  "Coahuila": ["671","842","844","861","862","864","866","867","869","871","872","873","877","878"],
  "Colima": ["312","313","314"],
  "Ciudad de México": ["55","56"],
  "Durango": ["618","629","649","671","674","675","676","677","871","872"],
  "Estado de México": ["55","56","427","588","591","592","593","594","595","596","597","599","711","712","713","714","716","717","718","719","721","722","723","724","725","726","728","729","743","751","761","767"],
  "Guanajuato": ["352","411","412","413","415","417","418","419","421","428","429","432","438","442","445","456","461","462","464","466","468","469","472","473","476","477","479"],
  "Guerrero": ["721","727","732","733","736","741","742","744","745","747","753","754","755","756","757","758","762","767","781"],
  "Hidalgo": ["441","483","591","738","743","746","748","759","761","763","771","772","773","774","775","776","778","779","789","791"],
  "Jalisco": ["33","312","315","316","317","321","322","326","341","342","343","344","345","346","347","348","349","354","357","358","371","372","373","374","375","376","377","378","382","384","385","386","387","388","391","392","393","395","424","431","437","457","474","475","495","496","499"],
  "Michoacán": ["313","328","351","352","353","354","355","356","359","381","383","393","394","421","422","423","424","425","426","434","435","436","438","443","447","451","452","453","454","455","459","471","711","715","753","767","786"],
  "Morelos": ["731","734","735","737","739","751","769","777"],
  "Nayarit": ["311","319","322","323","324","325","327","329","389","437"],
  "Nuevo León": ["81","488","821","823","824","825","826","828","829","867","873","892"],
  "Oaxaca": ["236","274","281","283","287","741","757","924","951","953","954","958","971","972","994","995"],
  "Puebla": ["221","222","223","224","226","227","231","232","233","236","237","238","243","244","245","248","249","273","275","276","278","282","746","764","776","797","953"],
  "Querétaro": ["414","419","427","441","442","446","448","487"],
  "Quintana Roo": ["983","984","987","997","998"],
  "San Luis Potosí": ["444"],
  "Sinaloa": ["667","669"],
  "Sonora": ["662"],
  "Tabasco": ["993"],
  "Tamaulipas": ["834","899"],
  "Tlaxcala": ["246"],
  "Veracruz": ["229","228"],
  "Yucatán": ["999"],
  "Zacatecas": ["492"]
};

// Construye el mapeo ladaToCiudad automáticamente
const ladaToCiudad: Record<string, string> = {};
for (const [estado, ladas] of Object.entries(ladaPorEstado)) {
  for (const lada of ladas) {
    ladaToCiudad[lada] = estado;
  }
}

const BASE_URL = "http://localhost:3001/api";
const c_name = "quicklearning";
const tableSlug = "sin_contestar";

async function main() {
  let page = 1;
  let totalUpdated = 0;
  let hasMore = true;
  const desconocidos: Set<string> = new Set();
  const ciudadStats: Record<string, number> = {};

  while (hasMore) {
    const url = `${BASE_URL}/records/table/${c_name}/${tableSlug}?page=${page}&limit=100&sortBy=createdAt&sortOrder=desc&filters={}`;
    const res = await axios.get(url);
    const records = res.data.records || res.data.data || [];
    if (records.length === 0) break;

    for (const record of records) {
      const telefono = record.data?.telefono || "";
      // Extrae la lada después de 521 (intenta 3 y luego 2 dígitos)
      let lada = "";
      const num = telefono.replace(/[^0-9]/g, "");
      if (num.startsWith("521")) {
        lada = num.substring(3, 6); // intenta 3 dígitos
        if (!ladaToCiudad[lada]) {
          lada = num.substring(3, 5); // intenta 2 dígitos
        }
      }
      const ciudad = ladaToCiudad[lada] || "Desconocido";

      if (ciudad === "Desconocido" && lada) {
        desconocidos.add(lada);
        console.log(`[DEBUG] Teléfono: ${telefono}, Lada extraída: ${lada}, Ciudad: Desconocido`);
      }
      if (!ciudadStats[ciudad]) ciudadStats[ciudad] = 0;
      ciudadStats[ciudad]++;

      if (record.data.ciudad !== ciudad) {
        // Actualiza el campo ciudad
        const updateUrl = `${BASE_URL}/records/${record._id}`;
        await axios.put(updateUrl, {
          data: {
            ...record.data,
            ciudad,
          },
          c_name: record.c_name,
          updatedBy: "admin@quicklearning.com"
        });
        console.log(`Actualizado registro ${record._id}: ciudad = ${ciudad}`);
        totalUpdated++;
      }
    }

    // Si hay menos de 100 registros, ya no hay más páginas
    hasMore = records.length === 100;
    page++;
  }

  // Resumen de ciudades y ladas desconocidas
  console.log("Resumen de ciudades asignadas:");
  for (const [ciudad, count] of Object.entries(ciudadStats)) {
    console.log(`  ${ciudad}: ${count}`);
  }
  if (desconocidos.size > 0) {
    console.log("Ladas no reconocidas (Desconocido):", Array.from(desconocidos).join(", "));
  } else {
    console.log("¡Todas las ladas fueron reconocidas correctamente!");
  }

  console.log(`Actualización completada. Total actualizados: ${totalUpdated}`);
}

main().catch(err => {
  console.error("Error:", err);
}); 