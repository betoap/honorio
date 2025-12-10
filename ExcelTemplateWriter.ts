import { saveAs } from 'file-saver';
import * as JSZip from 'jszip';

export class ExcelTemplateWriter {
  async gerar(): Promise<void> {
    // 1) Ler template Excel
    const response = await fetch('/assets/teste.xlsx');
    const arrayBuffer = await response.arrayBuffer();

    const zip = await JSZip.loadAsync(arrayBuffer);

    // 🔥 A segunda aba sempre é sheet2.xml
    const sheetPath = 'xl/worksheets/sheet2.xml';

    // 2) Ler XML da aba 2
    let sheetXml = await zip.file(sheetPath)!.async('string');

    // 3) Preencher células com cor
    sheetXml = await this.setCellValue(zip, sheetXml, 'A5', 'Linha 5', '#FFFF00');
    sheetXml = await this.setCellValue(zip, sheetXml, 'B5', '120', '#FFFF00');
    sheetXml = await this.setCellValue(zip, sheetXml, 'C5', '2.50', '#FFFF00');

    sheetXml = await this.setCellValue(zip, sheetXml, 'A6', 'Linha 6', '#CCFFCC');
    sheetXml = await this.setCellValue(zip, sheetXml, 'B6', '80', '#CCFFCC');
    sheetXml = await this.setCellValue(zip, sheetXml, 'C6', '5.50', '#CCFFCC');

    // 4) Atualiza o XML da planilha
    zip.file(sheetPath, sheetXml);

    // 5) Gerar XLSX final
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'resultado.xlsx');
  }

  // ================================================================
  //  ADICIONAR VALOR NA CÉLULA + ESTILO DE COR
  // ================================================================
  private async setCellValue(
    zip: JSZip,
    sheetXml: string,
    cellRef: string,
    value: string,
    color?: string // ← opcional
  ): Promise<string> {

    // Criar string no sharedStrings
    const stringIndex = await this.addSharedString(zip, value);

    let styleIndex: number | null = null;

    if (color) {
      styleIndex = await this.ensureStyleWithFill(zip, color);
    }

    const col = cellRef.replace(/[0-9]/g, '');
    const row = cellRef.replace(/[A-Z]/g, '');

    const rowRegex = new RegExp(`<row[^>]*r="${row}"[^>]*>([\\s\\S]*?)<\\/row>`, 'm');
    const styleAttr = styleIndex !== null ? ` s="${styleIndex}"` : '';

    // --------------------------------------------
    // 1) Criar ROW se não existir
    // --------------------------------------------
    if (!rowRegex.test(sheetXml)) {
      const newRow =
        `<row r="${row}">` +
        `<c r="${cellRef}"${styleAttr} t="s"><v>${stringIndex}</v></c>` +
        `</row>`;

      return sheetXml.replace('</sheetData>', `${newRow}</sheetData>`);
    }

    // --------------------------------------------
    // 2) Atualizar ou inserir célula dentro da ROW
    // --------------------------------------------
    return sheetXml.replace(rowRegex, (full, content) => {
      const cellRegex = new RegExp(`<c[^>]*r="${cellRef}"[^>]*>[\\s\\S]*?<\\/c>`, 'm');
      let newContent = content;

      // Atualiza célula existente
      if (cellRegex.test(content)) {
        newContent = content.replace(
          cellRegex,
          `<c r="${cellRef}"${styleAttr} t="s"><v>${stringIndex}</v></c>`
        );
      } else {
        // Adiciona nova célula na row
        newContent += `<c r="${cellRef}"${styleAttr} t="s"><v>${stringIndex}</v></c>`;
      }

      return `<row r="${row}">${newContent}</row>`;
    });
  }

  // ================================================================
  //  INSERIR TEXTO NO sharedStrings.xml
  // ================================================================
  private async addSharedString(zip: JSZip, text: string): Promise<number> {
    const path = 'xl/sharedStrings.xml';
    let xml = await zip.file(path)!.async('string');

    const matches = xml.match(/<si>/g);
    const count = matches ? matches.length : 0;

    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

    const newEntry = `<si><t>${escaped}</t></si>`;

    xml = xml.replace('</sst>', `${newEntry}</sst>`);
    xml = xml.replace(/count="(\d+)"/, (_m, n) => `count="${+n + 1}"`);
    xml = xml.replace(/uniqueCount="(\d+)"/, (_m, n) => `uniqueCount="${+n + 1}"`);

    zip.file(path, xml);

    return count;
  }

  // ================================================================
  //   CRIAR FILL + XF PARA A COR DA CÉLULA
  // ================================================================
  private async ensureStyleWithFill(zip: JSZip, hexColor: string): Promise<number> {
    const stylesPath = "xl/styles.xml";
    let xml = await zip.file(stylesPath)!.async("string");

    hexColor = hexColor.replace("#", "").toUpperCase();

    // -----------------------------
    // 1) Criar FILL se não existir
    // -----------------------------
    const fillsMatch = xml.match(/<fills[^>]*count="(\d+)"/);
    const fillCount = fillsMatch ? parseInt(fillsMatch[1]) : 0;

    const fillRegex = new RegExp(
      `<patternFill[^>]*><fgColor rgb="FF${hexColor}"/><\\/patternFill>`
    );

    let fillIndex = -1;

    const allFills = [...xml.matchAll(/<fill>[\s\S]*?<\/fill>/g)];

    // Já existe?
    fillIndex = allFills.findIndex(f => fillRegex.test(f[0]));

    if (fillIndex === -1) {
      // Criar novo fill
      const newFill =
        `<fill><patternFill patternType="solid"><fgColor rgb="FF${hexColor}"/></patternFill></fill>`;

      xml = xml.replace('</fills>', `${newFill}</fills>`);
      fillIndex = fillCount;

      xml = xml.replace(
        /<fills[^>]*count="(\d+)"/,
        `<fills count="${fillCount + 1}"`
      );
    }

    // -----------------------------
    // 2) Criar XF baseado nesse fill
    // -----------------------------
    const xfsMatch = xml.match(/<cellXfs[^>]*count="(\d+)"/);
    const xfsCount = xfsMatch ? parseInt(xfsMatch[1]) : 0;

    const newXf =
      `<xf xfId="0" applyFill="1" fillId="${fillIndex}" fontId="0" borderId="0" numFmtId="0"/>`;

    xml = xml.replace('</cellXfs>', `${newXf}</cellXfs>`);

    const styleIndex = xfsCount;

    xml = xml.replace(
      /<cellXfs[^>]*count="(\d+)"/,
      `<cellXfs count="${xfsCount + 1}"`
    );

    // Salvar alterações
    zip.file(stylesPath, xml);

    return styleIndex;
  }
}




private async ensureStyleWithFill(zip: JSZip, hexColor: string): Promise<number> {
  const stylesPath = 'xl/styles.xml';
  let xml = await zip.file(stylesPath)!.async('string');

  hexColor = hexColor.replace('#', '').toUpperCase();

  // -----------------------------
  // 1) FILL: procurar ou criar
  // -----------------------------
  const fillsHeaderMatch = xml.match(/<fills[^>]*count="(\d+)"/);
  const fillCount = fillsHeaderMatch ? parseInt(fillsHeaderMatch[1], 10) : 0;

  let fillIndex = -1;

  // Percorre todos os <fill>...</fill> manualmente (sem matchAll)
  const fillTagRegex = /<fill>[\s\S]*?<\/fill>/g;
  const fills: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = fillTagRegex.exec(xml)) !== null) {
    fills.push(match[0]);
  }

  fillIndex = fills.findIndex(f =>
    f.indexOf(`rgb="FF${hexColor}"`) !== -1
  );

  // Se não encontrou, cria um novo fill
  if (fillIndex === -1) {
    const newFill =
      `<fill><patternFill patternType="solid"><fgColor rgb="FF${hexColor}"/></patternFill></fill>`;

    xml = xml.replace('</fills>', `${newFill}</fills>`);

    // Atualiza o count de fills
    xml = xml.replace(
      /<fills([^>]*)count="(\d+)"/,
      (_m, attrs, n) => `<fills${attrs}count="${parseInt(n, 10) + 1}"`
    );

    fillIndex = fillCount;
  }

  // -----------------------------
  // 2) XF: criar estilo usando esse fill
  // -----------------------------
  const xfsHeaderMatch = xml.match(/<cellXfs[^>]*count="(\d+)"/);
  const xfsCount = xfsHeaderMatch ? parseInt(xfsHeaderMatch[1], 10) : 0;

  const newXf =
    `<xf xfId="0" applyFill="1" fillId="${fillIndex}" fontId="0" borderId="0" numFmtId="0"/>`;

  xml = xml.replace('</cellXfs>', `${newXf}</cellXfs>`);

  const styleIndex = xfsCount;

  xml = xml.replace(
    /<cellXfs([^>]*)count="(\d+)"/,
    (_m, attrs, n) => `<cellXfs${attrs}count="${parseInt(n, 10) + 1}"`
  );

  // Salva o styles.xml modificado
  zip.file(stylesPath, xml);

  return styleIndex;
}

