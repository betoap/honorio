import { saveAs } from 'file-saver';
import * as JSZip from 'jszip';

export class ExcelTemplateWriter {
  async gerar(): Promise<void> {
    // 1) Ler template Excel
    const response = await fetch('/assets/teste.xlsx');
    const arrayBuffer = await response.arrayBuffer();

    const zip = await JSZip.loadAsync(arrayBuffer);

    // 🔥 Aba 2 = sheet2.xml (confirmado no arquivo)
    const sheetPath = 'xl/worksheets/sheet2.xml';

    // 2) Ler XML da aba
    let sheetXml = await zip.file(sheetPath)!.async('string');

    // 3) Editar células desejadas
    sheetXml = await this.setCellValue(zip, sheetXml, 'A5', 'Linha 5');
    sheetXml = await this.setCellValue(zip, sheetXml, 'B5', '120');
    sheetXml = await this.setCellValue(zip, sheetXml, 'C5', '2.50');

    sheetXml = await this.setCellValue(zip, sheetXml, 'A6', 'Linha 6');
    sheetXml = await this.setCellValue(zip, sheetXml, 'B6', '80');
    sheetXml = await this.setCellValue(zip, sheetXml, 'C6', '5.50');

    // 4) Substitui o XML da aba
    zip.file(sheetPath, sheetXml);

    // 5) Gera novo arquivo
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'resultado.xlsx');
  }

  private async setCellValue(
    zip: JSZip,
    sheetXml: string,
    cellRef: string,
    value: string
  ): Promise<string> {
    const stringIndex = await this.addSharedString(zip, value);

    const col = cellRef.replace(/[0-9]/g, '');
    const row = cellRef.replace(/[A-Z]/g, '');

    const rowRegex = new RegExp(
      `<row[^>]*r="${row}"[^>]*>([\\s\\S]*?)<\\/row>`,
      'm'
    );

    // ------------------------------------------------------------
    // 1) SE A ROW NÃO EXISTIR → CRIA
    // ------------------------------------------------------------
    if (!rowRegex.test(sheetXml)) {
      const newRow =
        `<row r="${row}">` +
        `<c r="${cellRef}" t="s"><v>${stringIndex}</v></c>` +
        `</row>`;

      // adiciona antes de </sheetData>
      sheetXml = sheetXml.replace('</sheetData>', `${newRow}</sheetData>`);
      return sheetXml;
    }

    // ------------------------------------------------------------
    // 2) ROW EXISTE → atualizar ou inserir célula
    // ------------------------------------------------------------
    return sheetXml.replace(rowRegex, (full, content) => {
      const cellRegex = new RegExp(
        `<c[^>]*r="${cellRef}"[^>]*>[\\s\\S]*?<\\/c>`,
        'm'
      );
      let newContent = content;

      // SE A CÉLULA EXISTE → substitui
      if (cellRegex.test(content)) {
        newContent = content.replace(
          cellRegex,
          `<c r="${cellRef}" t="s"><v>${stringIndex}</v></c>`
        );
      } else {
        // SE NÃO EXISTE → adiciona dentro da row
        newContent += `<c r="${cellRef}" t="s"><v>${stringIndex}</v></c>`;
      }

      return `<row r="${row}">${newContent}</row>`;
    });
  }

  private async addSharedString(zip: JSZip, text: string): Promise<number> {
    const path = 'xl/sharedStrings.xml';

    let xml = await zip.file(path)!.async('string');

    const matches = xml.match(/<si>/g);
    const count = matches ? matches.length : 0;

    const newEntry = `<si><t>${text}</t></si>`;

    xml = xml.replace('</sst>', `${newEntry}</sst>`);
    xml = xml.replace(/count="(\d+)"/, (_, n) => `count="${+n + 1}"`);
    xml = xml.replace(
      /uniqueCount="(\d+)"/,
      (_, n) => `uniqueCount="${+n + 1}"`
    );

    zip.file(path, xml);

    return count; // Índice do novo texto
  }
}
