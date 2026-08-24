import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PDF_URL = path.join(ROOT, 'བྱང་ཆུབ་ལམ་རིམ་ཆེན་མོ།_Lamrim.pdf');
export const STD_FONTS = path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts/') + path.sep;
export const RAW = path.join(ROOT, 'source/raw');
export const CLEAN = path.join(ROOT, 'source/clean');
export const QA = path.join(ROOT, 'qa');
