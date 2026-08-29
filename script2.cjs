
const fs = require("fs");
let data = fs.readFileSync("src/components/LeituraFotoModal/LeituraFotoModal.jsx", "utf8");
data = data.replace("const chaveStorage = leituras_anteriores_\\;", "const chaveStorage = `leituras_anteriores_${condId}`;");
fs.writeFileSync("src/components/LeituraFotoModal/LeituraFotoModal.jsx", data, "utf8");

