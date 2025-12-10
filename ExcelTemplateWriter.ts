import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export class ExcelTemplateWriter {

  constructor(private templateUrl: string) {}

  async gerar(): Promise<void> {
    try {
      console.log('[ExcelWriter] Carregando arquivo...');
      const zip = await this.loadTemplate();

      console.log('[ExcelWriter] Lendo planilha 2...');
      let sheetXml = await this.getSheetXml(zip, 'sheet2.xml');

      // ============================
      // EDITAR CELULAS DESEJADAS
      // ============================
      sheetXml = await this.setCellValue(zip, sheetXml, 'A5', 'Linha 5');
      sheetXml = await this.setCellValue(zip, sheetXml, 'B5', '120');
      sheetXml = await this.setCellValue(zip, sheetXml, 'C5', '2.50');

      sheetXml = await this.setCellValue(zip, sheetXml, 'A6', 'Linha 6');
      sheetXml = await this.setCellValue(zip, sheetXml, 'B6', '80');
      sheetXml = await this.setCellValue(zip, sheetXml, 'C6', '5.50');

      // Salva alterações na sheet2
      zip.file('xl/worksheets/sheet2.xml', sheetXml);

      console.log('[ExcelWriter] Gerando arquivo final...');
      const blob = await zip.generateAsync({ type: 'blob' });

      // 🔥 VOLTOU AQUI → FileSaver.js
      saveAs(blob, 'resultado.xlsx');

      console.log('[ExcelWriter] FINALIZADO!');

    } catch (err) {
      console.error('Erro ao gerar Excel:', err);
    }
  }

  // -----------------------------------------------------
  // 1) CARREGA O XLSX VIA HTTP
  // -----------------------------------------------------
  private async loadTemplate(): Promise<JSZip> {
    const response = await fetch(this.templateUrl);
    const arrayBuffer = await response.arrayBuffer();
    return await JSZip.loadAsync(arrayBuffer);
  }

  // -----------------------------------------------------
  // 2) OBTÉM O XML DA PLANILHA
  // -----------------------------------------------------
  private async getSheetXml(zip: JSZip, sheetName: string): Promise<string> {
    const file = zip.file(`xl/worksheets/${sheetName}`);
    if (!file) throw new Error(`Planilha não encontrada: ${sheetName}`);
    return await file.async('string');
  }

  // -----------------------------------------------------
  // 3) REUTILIZA TODAS AS PROPRIEDADES DA CÉLULA EXISTENTE
  // -----------------------------------------------------
  private async setCellValue(
    zip: JSZip,
    sheetXml: string,
    cellRef: string,
    value: string
  ): Promise<string> {

    // Procura a célula existente <c r="A5" ...>...</c>
    const cellRegex = new RegExp(`<c[^>]*r="${cellRef}"[^>]*>[\\s\\S]*?<\\/c>`, 'm');

    // --------------------------------------------
    // CÉLULA EXISTE → trocar somente o <v>
    // --------------------------------------------
    if (cellRegex.test(sheetXml)) {
      return sheetXml.replace(cellRegex, (cellXml: string) => {

        // Já tem <v>
        if (/<v>[\s\S]*?<\/v>/.test(cellXml)) {
          return cellXml.replace(/<v>[\s\S]*?<\/v>/, `<v>${value}</v>`);
        }

        // Não tinha <v> → adicionar antes do </c>
        return cellXml.replace('</c>', `<v>${value}</v></c>`);
      });
    }

    // --------------------------------------------
    // NÃO EXISTE → criar célula nova
    // --------------------------------------------
    const newCell = `<c r="${cellRef}"><v>${value}</v></c>`;
    return sheetXml.replace('</sheetData>', `${newCell}</sheetData>`);
  }
}
