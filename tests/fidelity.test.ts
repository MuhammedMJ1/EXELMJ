// Fidelity shield: a foreign xlsm carrying a pivot table, a native chart and a
// VBA project must survive "open in EXELMJ → edit a cell → save" intact.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { importXlsx } from '../src/xlsx/importXlsx'
import { exportXlsx } from '../src/xlsx/exportXlsx'
import { fidelityMerge } from '../src/xlsx/fidelityShield'
import { sheetPartsInOrder } from '../src/xlsx/zipUtils'

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const VBA_BYTES = new Uint8Array([1, 2, 3, 4, 5])

async function buildForeignXlsm(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/pivotTables/pivotTable1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>
<Override PartName="/xl/pivotCache/pivotCacheDefinition1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/>
<Override PartName="/xl/pivotCache/pivotCacheRecords1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/>
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  )
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}">
<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>
<pivotCaches><pivotCache cacheId="1" r:id="rId3"/></pivotCaches>
</workbook>`
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>
<Relationship Id="rId3" Type="${R}/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition1.xml"/>
<Relationship Id="rId4" Type="${R}/styles" Target="styles.xml"/>
</Relationships>`
  )
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}">
<sheetData><row r="1"><c r="A1"><v>5</v></c></row></sheetData>
<drawing r:id="rId2"/>
</worksheet>`
  )
  zip.file(
    'xl/worksheets/_rels/sheet1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/pivotTable" Target="../pivotTables/pivotTable1.xml"/>
<Relationship Id="rId2" Type="${R}/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
  )
  zip.file(
    'xl/pivotTables/pivotTable1.xml',
    `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="PivotTable1" cacheId="1"/>`
  )
  zip.file(
    'xl/pivotTables/_rels/pivotTable1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/pivotCacheDefinition" Target="../pivotCache/pivotCacheDefinition1.xml"/>
</Relationships>`
  )
  zip.file(
    'xl/pivotCache/pivotCacheDefinition1.xml',
    `<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" r:id="rId1" xmlns:r="${R}"/>`
  )
  zip.file(
    'xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/pivotCacheRecords" Target="pivotCacheRecords1.xml"/>
</Relationships>`
  )
  zip.file(
    'xl/pivotCache/pivotCacheRecords1.xml',
    `<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0"/>`
  )
  zip.file(
    'xl/drawings/drawing1.xml',
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>`
  )
  zip.file(
    'xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${R}/chart" Target="../charts/chart1.xml"/>
</Relationships>`
  )
  zip.file(
    'xl/charts/chart1.xml',
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>`
  )
  zip.file('xl/vbaProject.bin', VBA_BYTES)
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

describe('fidelity shield', () => {
  it('preserves pivot, native chart and VBA through open→edit→save', async () => {
    const original = await buildForeignXlsm()

    // open in EXELMJ
    const imported = await importXlsx(original, 'foreign.xlsm')
    expect(imported.sheets[imported.sheetOrder[0]].name).toBe('Data')
    expect(imported.sheets[imported.sheetOrder[0]].cellData?.[0]?.[0]?.v).toBe(5)

    // edit a cell
    imported.sheets[imported.sheetOrder[0]].cellData![0]![1] = { v: 99, t: 2 }

    // save with the shield
    const exported = await exportXlsx(imported)
    const { bytes: merged, report } = await fidelityMerge(exported, original)
    expect(report.vba).toBe(true)
    expect(report.pivotSheets).toContain('Data')
    expect(report.drawingSheets).toContain('Data')

    // inspect the merged zip
    const zip = await JSZip.loadAsync(merged)
    const vba = await zip.file('xl/vbaProject.bin')?.async('uint8array')
    expect([...(vba ?? [])]).toEqual([...VBA_BYTES])
    expect(zip.file('xl/pivotTables/pivotTable1.xml')).toBeTruthy()
    expect(zip.file('xl/pivotCache/pivotCacheDefinition1.xml')).toBeTruthy()
    expect(zip.file('xl/pivotCache/pivotCacheRecords1.xml')).toBeTruthy()
    expect(zip.file('xl/drawings/drawing1.xml')).toBeTruthy()
    expect(zip.file('xl/charts/chart1.xml')).toBeTruthy()

    const sheets = await sheetPartsInOrder(zip)
    const dataPart = sheets.find((s) => s.name === 'Data')!.part
    const sheetXml = (await zip.file(dataPart)?.async('string')) ?? ''
    expect(sheetXml).toContain('<drawing r:id=')
    const relsXml =
      (await zip
        .file(`${dataPart.slice(0, dataPart.lastIndexOf('/'))}/_rels/${dataPart.split('/').pop()}.rels`)
        ?.async('string')) ?? ''
    expect(relsXml).toContain('/pivotTable"')
    expect(relsXml).toContain('/drawing"')

    const wbXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
    expect(wbXml).toContain('<pivotCaches>')
    const ct = (await zip.file('[Content_Types].xml')?.async('string')) ?? ''
    expect(ct).toContain('macroEnabled.main+xml')
    expect(ct).toContain('/xl/pivotTables/pivotTable1.xml')
    expect(ct).toContain('Extension="bin"')

    // the edit survived, and exceljs can still load the merged file
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(
      merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength) as ExcelJS.Buffer
    )
    const ws = wb.worksheets.find((w) => w.name === 'Data')!
    expect(ws.getCell('A1').value).toBe(5)
    expect(ws.getCell('B1').value).toBe(99)
  })

  it('keeps EXELMJ-added images and skips the original drawing on conflict', async () => {
    const original = await buildForeignXlsm()
    const imported = await importXlsx(original, 'foreign.xlsm')
    // simulate an EXELMJ image on the same sheet → exported file gets its own drawing
    const sheetId = imported.sheetOrder[0]
    imported.resources = [
      ...(imported.resources ?? []),
      {
        name: 'SHEET_DRAWING_PLUGIN',
        data: JSON.stringify({
          [sheetId]: {
            data: {
              d1: {
                drawingId: 'd1',
                drawingType: 0,
                imageSourceType: 'URL',
                source:
                  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                column: 1,
                row: 1,
                width: 40,
                height: 30
              }
            },
            order: ['d1']
          }
        })
      }
    ]
    const exported = await exportXlsx(imported)
    const { report } = await fidelityMerge(exported, original)
    expect(report.skipped).toContain('drawing:Data')
    expect(report.pivotSheets).toContain('Data') // pivot still preserved
  })

  it('drops parts for sheets the user deleted, without breaking the file', async () => {
    const original = await buildForeignXlsm()
    const imported = await importXlsx(original, 'foreign.xlsm')
    // rename the sheet → name mapping breaks by design
    imported.sheets[imported.sheetOrder[0]].name = 'Renamed'
    const exported = await exportXlsx(imported)
    const { bytes: merged, report } = await fidelityMerge(exported, original)
    expect(report.skipped).toContain('sheet:Data')
    expect(report.pivotSheets).toHaveLength(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(
      merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength) as ExcelJS.Buffer
    )
    expect(wb.worksheets.some((w) => w.name === 'Renamed')).toBe(true)
  })
})
