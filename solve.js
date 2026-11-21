// A fast drop-in for csv-reader 1.0.0: run(input) answers {columns, rows,
// errors} exactly as the reference does, for every {text, header}.
//
// The reference walks the text one character at a time, growing each field
// with `value += c`. This version never does that. It jumps instead: an
// unquoted field is found with indexOf over the next comma, line feed and
// carriage return, and the whole field is taken with one slice; a quoted
// field is found with indexOf over the next quote, and its body is taken
// with one slice per quoted run. Only the rare broken bits — a stray CR,
// a doubled quote, a line break inside quotes — are handled character by
// character, and only inside the short stretch that holds them.
//
// The reading policy is the reference's own, kept line for line:
// a U+FEFF at the very start is dropped; a record ends at LF or CRLF and a
// line left with no characters is no record; outside quotes a CR not
// followed by LF is dropped (error stray_cr); a field that opens with a
// quote runs to the next quote that is not doubled, "" inside it is one
// quote, and each CRLF or lone CR inside it is read as LF; what follows
// its closing quote, up to the next comma or line break, is appended as
// it stands (quote_junk, when the field ends); a quote that never closes
// is a literal character, and the text after it is read again as unquoted
// (unterminated_quote); a quote inside an unquoted field is a literal
// character; fields stay strings, never trimmed or converted; columns is
// the first record when header is true, else null; rows are padded with
// empty strings (short_row, with fields: its field count) or cut
// (long_row, with extra: the cut fields) to the first record's width.
// Each error is {code, line, row}, in the order met: line the 1-based
// line its record starts on, row its record's index in rows (null for
// the header). A line that held only stray CRs leaves no record, though
// its stray_cr errors stay.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Errors name the record, not the spot.
  let recordLine = 1;
  let recordRow = null;

  // The last field read: its value, how it ended, and how many characters
  // were kept into it (stray CRs are dropped, never counted).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `start` up to the next comma or line
  // break. A CR not followed by LF is dropped and reported, then reading
  // goes on from the character after it. Sets fValue, fEnded, fAdded.
  function readUnquoted(start) {
    let value = start;
    let added = 0;
    for (;;) {
      if (pos >= len) {
        fValue = value; fEnded = END; fAdded = added;
        return;
      }
      const commaAt = text.indexOf(',', pos);
      const lfAt = text.indexOf('\n', pos);
      let end = commaAt === -1
        ? (lfAt === -1 ? Infinity : lfAt)
        : (lfAt === -1 ? commaAt : (commaAt < lfAt ? commaAt : lfAt));
      const crAt = text.indexOf('\r', pos);
      if (crAt !== -1 && crAt < end) {
        if (text.charCodeAt(crAt + 1) === 10) {
          // CRLF: the record ends here, the CR is part of the break.
          if (crAt > pos) { value += text.slice(pos, crAt); added += crAt - pos; }
          pos = crAt + 2;
          line += 1;
          fValue = value; fEnded = LINE_BREAK; fAdded = added;
          return;
        }
        // A lone CR: dropped, reported, and reading goes on.
        if (crAt > pos) { value += text.slice(pos, crAt); added += crAt - pos; }
        pushError('stray_cr');
        pos = crAt + 1;
        continue;
      }
      if (end === Infinity) {
        if (pos < len) { value += text.slice(pos); added += len - pos; }
        pos = len;
        fValue = value; fEnded = END; fAdded = added;
        return;
      }
      if (end > pos) { value += text.slice(pos, end); added += end - pos; }
      if (text.charCodeAt(end) === 44) {
        pos = end + 1;
        fValue = value; fEnded = COMMA; fAdded = added;
        return;
      }
      pos = end + 1;
      line += 1;
      fValue = value; fEnded = LINE_BREAK; fAdded = added;
      return;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue,
  // fEnded, fAdded the same way readUnquoted does.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let segStart = pos;
    let parts = null; // segments joined only when a doubled quote splits them
    let value;
    for (;;) {
      const q = text.indexOf('"', segStart);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted, from where it stood.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        readUnquoted('"');
        return;
      }
      let seg = text.slice(segStart, q);
      if (/[\r\n]/.test(seg)) {
        // Each CRLF or lone CR inside quotes is one LF; each LF is one.
        const breaks = seg.match(/\r\n?|\n/g);
        if (breaks !== null) line += breaks.length;
        seg = seg.replace(/\r\n?/g, '\n');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field goes on.
        if (parts === null) parts = [];
        parts.push(seg);
        parts.push('"');
        segStart = q + 2;
        continue;
      }
      // The closing quote.
      value = parts === null ? seg : (parts.push(seg), parts.join(''));
      pos = q + 1;
      break;
    }
    if (pos >= len) {
      fValue = value; fEnded = END; fAdded = 0;
      return;
    }
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      fValue = value; fEnded = COMMA; fAdded = 0;
      return;
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      fValue = value; fEnded = LINE_BREAK; fAdded = 0;
      return;
    }
    if (c === '\r' && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = value; fEnded = LINE_BREAK; fAdded = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    readUnquoted(value);
    if (fAdded > 0) pushError('quote_junk');
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text[pos] === '"';
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
