import { promises as fs } from "fs";
import path from "path";
import { sync as globSync } from "glob";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default;

// --- CONFIGURACIÓN ---
const PROJECT_DIR = "."; // Ruta del proyecto
const LIBRARIES_TO_TRACK = ["@vetsource/kibble", "@mui/material"];

const packageJsonPath = path.resolve(process.cwd(), "package.json");

// Objeto global para las estad&iacute;sticas de componentes
const stats = {};
LIBRARIES_TO_TRACK.forEach((lib) => (stats[lib] = {}));

// --- LÓGICA 1: OBTENER INFO DEL PACKAGE.JSON ---

async function getPackageInfo() {
  try {
    const fileContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageData = JSON.parse(fileContent);
    const projectName = packageData.name;

    const allDependencies = {
      ...packageData.dependencies,
      ...packageData.devDependencies,
    };

    const vetsourceLibraries = {};
    for (const libName in allDependencies) {
      if (libName.startsWith("@vetsource/")) {
        vetsourceLibraries[libName] = allDependencies[libName];
      }
    }

    return {
      projectName: projectName,
      vetsourceLibraries: vetsourceLibraries,
    };
  } catch (error) {
    console.error("Error al leer package.json:", error);
    return { projectName: "Error", vetsourceLibraries: {} };
  }
}

// --- LÓGICA 2: ANÁLISIS DE COMPONENTES (AST) ---

function analyzeCode() {
  const filePaths = globSync(`${PROJECT_DIR}/**/*.{js,jsx,ts,tsx}`, {
    ignore: [
      "**/node_modules/**",
      "**/*.d.ts",
      "**/*.spec.*",
      "**/*.test.*",
      "**/analizer.js",
      "**/analizer.mjs",
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
  console.log("Análisis de componentes completado.");
}

// --- LÓGICA 3: GENERACIÓN DE REPORTES ---

function generateComponentArray(report) {
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
        files: [...data.files],
      });
    });
  });
  return payload;
}

function generateSheet(componentStats) {
  let csvContent = "Library,Component,ImportCount,UsageCount,isUsed,Files\n";
  const componentArray = generateComponentArray(componentStats); // Usamos la funci&oacute;n helper

  componentArray.forEach((item) => {
    const fileList = item.files.join("; ");
    csvContent += `"${item.library}","${item.component}",${item.import_count},${item.usage_count},"${item.is_used}","${fileList}"\n`;
  });

  try {
    fs.writeFileSync("component_report.csv", csvContent, "utf-8");
    console.log('Reporte "component_report.csv" generado con éxito.');
  } catch (error) {
    console.error("Error al guardar el archivo CSV:", error);
  }
}

// --- EJECUCIÓN PRINCIPAL ---

async function main() {
  // 1. Ejecuta ambas tareas de an&aacute;lisis
  const packageInfo = await getPackageInfo();
  analyzeCode(); // Esta funci&oacute;n modifica el 'stats' global

  // 2. Genera el CSV (usa el 'stats' global)
  generateSheet(stats);

  // 3. Combina AMBOS resultados en un solo payload JSON
  const finalPayload = {
    projectInfo: packageInfo,
    componentReport: generateComponentArray(stats), // Usa el 'stats' global
  };

  // 4. Guarda el JSON combinado para n8n
  try {
    fs.writeFileSync(
      "report.json",
      JSON.stringify(finalPayload, null, 2),
      "utf-8"
    );
    console.log('Reporte "report.json" combinado generado con éxito.');
  } catch (error) {
    console.error("Error al guardar el archivo JSON:", error);
  }

  console.log(JSON.stringify(finalPayload, null, 2));
}

main();
