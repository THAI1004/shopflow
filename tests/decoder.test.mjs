import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {prepareZXingModule as prepareReader,readBarcodes} from 'zxing-wasm/reader';import {prepareZXingModule as prepareWriter,writeBarcode} from 'zxing-wasm/writer';
prepareReader({overrides:{wasmBinary:await readFile(new URL('../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',import.meta.url))}});
prepareWriter({overrides:{wasmBinary:await readFile(new URL('../node_modules/zxing-wasm/dist/writer/zxing_writer.wasm',import.meta.url))}});
for(const format of ['QRCode','Code128'])test('WASM decoder reads '+format+' without network or customer data',async()=>{const encoded=await writeBarcode('QA-TRACKING-123456',{format,scale:4});assert.equal(encoded.error,'');assert.ok(encoded.image);const results=await readBarcodes(encoded.image,{tryHarder:true,formats:['QRCode','Code128'],maxNumberOfSymbols:4});assert.ok(results.some(r=>r.text==='QA-TRACKING-123456'));});
