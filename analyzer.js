import fs from "fs";
import path from "path";
import { sync as globSync } from "glob";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default;

const PROJECT_DIR = process.argv[2] || ".";
const LIBRARIES_TO_TRACK = ["@vetsource/kibble", "@mui/material"];
const stats = {};
LIBRARIES_TO_TRACK.forEach((lib) => (stats[lib] = {}));

function analyzeCode() {
  const filePaths = globSync(`${PROJECT_DIR}/**/*.{js,jsx,ts,tsx}`, {
    ignore: [
      "**/node_modules/**",
      "**/*.d.ts",
      "**/*.spec.*",
      "**/*.test.*",
      "**/analyzer.js", // Se ignora a sí mismo
    ],
  });

  console.log(`Analizando ${filePaths.length} archivos válidos...`);

  filePaths.forEach((filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });

      const localImports = {};

      traverse(ast, {
        // Pasada 1: Encontrar todas las importaciones
        ImportDeclaration(path) {
          const libName = path.node.source.value;

          if (LIBRARIES_TO_TRACK.includes(libName)) {
            path.node.specifiers.forEach((specifier) => {
              if (specifier.type === "ImportSpecifier") {
                const importedName = specifier.imported.name;
                const localName = specifier.local.name;

                if (!stats[libName][importedName]) {
                  stats[libName][importedName] = {
                    imports: 0,
                    usage: 0,
                    files: new Set(),
                  };
                }

                stats[libName][importedName].imports += 1;
                // --- CORRECCIÓN DE BUG: Registramos el archivo en la importación ---
                stats[libName][importedName].files.add(filePath);
                localImports[localName] = {
                  lib: libName,
                  original: importedName,
                };
              }
            });
          }
        },

        JSXOpeningElement(path) {
          const nodeName = path.node.name.name;

          if (localImports[nodeName]) {
            const { lib, original } = localImports[nodeName];
            stats[lib][original].usage += 1;
          }
        },
      });
    } catch (error) {
      console.warn(
        `Error analizando ${filePath}: ${error.message}. Saltando archivo.`
      );
    }
  });

  console.log("Análisis completado.");
}

function generateSheet(report) {
  // Añadimos la columna 'isUsed'
  let csvContent = "Library,Component,ImportCount,UsageCount,isUsed,Files\n";

  Object.keys(report).forEach((lib) => {
    Object.keys(report[lib]).forEach((component) => {
      const data = report[lib][component];
      const fileList = [...data.files].join("; ");
      // Añadimos la lógica para "Yes" o "No"
      const isUsed = data.usage > 0 ? "Yes" : "No";

      // Añadimos la nueva columna al string de la fila
      csvContent += `"${lib}","${component}",${data.imports},${data.usage},"${isUsed}","${fileList}"\n`;
    });
  });

  try {
    fs.writeFileSync("component_report.csv", csvContent, "utf-8");
    console.log('Reporte "component_report.csv" generado con éxito.');
  } catch (error) {
    console.error("Error al guardar el archivo CSV:", error);
  }
}

/**
 * NUEVA FUNCIÓN: Convierte el reporte en un JSON limpio para el webhook.
 */
function generateJsonPayload(report) {
  const payload = [];

  Object.keys(report).forEach((lib) => {
    Object.keys(report[lib]).forEach((componentName) => {
      const data = report[lib][componentName];

      payload.push({
        library: lib,
        component: componentName,
        import_count: data.imports,
        usage_count: data.usage,
        is_used: data.usage > 0 ? "Yes" : "No",
        files: [...data.files], // Convertimos el Set en un Array para JSON
      });
    });
  });

  // Devolvemos el array completo como un string JSON
  return JSON.stringify(payload, null, 2);
}

// --- EJECUCIÓN ---
analyzeCode();

// Generamos ambos reportes
generateSheet(stats);
generateJsonPayload(stats);

// Guardamos el reporte JSON para que el pipeline lo pueda leer
const jsonPayload = generateJsonPayload(stats);
try {
  fs.writeFileSync("report.json", jsonPayload, "utf-8");
  console.log('Reporte "report.json" generado con éxito.');
} catch (error) {
  console.error("Error al guardar el archivo JSON:", error);
}

console.log(stats);
