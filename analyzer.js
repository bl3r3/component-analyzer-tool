import { promises as fs } from "fs"; // Importamos la versi&oacute;n de promesas como 'fs'
import path from "path";
import { sync as globSync } from "glob";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
const traverse = _traverse.default;

// --- CONFIGURACIÓN ---
const PROJECT_DIR = ".";
const LIBRARIES_TO_TRACK = ["@vetsource/kibble", "@mui/material"];
const packageJsonPath = path.resolve(process.cwd(), "package.json");

const stats = {};
LIBRARIES_TO_TRACK.forEach((lib) => (stats[lib] = {}));

// --- LÓGICA 1: OBTENER INFO DEL PACKAGE.JSON ---
// (Esta funci&oacute;n ya era async y estaba correcta)
async function getPackageInfo() {
  try {
    const fileContent = await fs.readFile(packageJsonPath, "utf-8"); // Correcto: usa await
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

// -- CAMBIO: La funci&oacute;n ahora es 'async'
async function analyzeCode() {
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

  // -- CAMBIO: Usamos 'for...of' para poder usar 'await' dentro del bucle
  for (const filePath of filePaths) {
    try {
      // -- CAMBIO: De 'fs.readFileSync' a 'await fs.readFile'
      const content = await fs.readFile(filePath, "utf-8");
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
      const localImports = {};

      traverse(ast, {
        ImportDeclaration(path) {
          // ... (l&oacute;gica interna sin cambios)
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
          // ... (l&oacute;gica interna sin cambios)
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
  }
  console.log("Análisis de componentes completado.");
}

// --- LÓGICA 3: GENERACIÓN DE REPORTES ---

function generateComponentArray(report) {
  // ... (l&oacute;gica interna sin cambios)
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

// -- CAMBIO: La funci&oacute;n ahora es 'async'
async function generateSheet(componentStats) {
  let csvContent = "Library,Component,ImportCount,UsageCount,isUsed,Files\n";
  const componentArray = generateComponentArray(componentStats);

  componentArray.forEach((item) => {
    const fileList = item.files.join("; ");
    csvContent += `"${item.library}","${item.component}",${item.import_count},${item.usage_count},"${item.is_used}","${fileList}"\n`;
  });

  try {
    // -- CAMBIO: De 'fs.writeFileSync' a 'await fs.writeFile'
    await fs.writeFile("component_report.csv", csvContent, "utf-8");
    console.log('Reporte "component_report.csv" generado con éxito.');
  } catch (error) {
    console.error("Error al guardar el archivo CSV:", error);
  }
}

// --- EJECUCIÓN PRINCIPAL ---

// (Esta funci&oacute;n ya era 'async')
async function main() {
  const packageInfo = await getPackageInfo();

  // -- CAMBIO: A&ntilde;adimos 'await'
  await analyzeCode();

  // -- CAMBIO: A&ntilde;adimos 'await'
  await generateSheet(stats);

  const finalPayload = {
    projectInfo: packageInfo,
    componentReport: generateComponentArray(stats),
  };

  try {
    // -- CAMBIO: De 'fs.writeFileSync' a 'await fs.writeFile'
    await fs.writeFile(
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

// Iniciar el script
main();
