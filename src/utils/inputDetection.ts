/**
 * Utility to detect whether source code in a supported language reasonably expects stdin.
 * 
 * Languages supported:
 * 1. Java: Scanner reads (nextInt, nextLine, next, etc.), BufferedReader (readLine, read), System.in.read, Console.readLine
 * 2. C: scanf, getchar, fgets, fscanf(stdin, ...), fread(..., stdin), getc(stdin), fgetc(stdin)
 * 3. C++: cin, getline, std::cin, std::getline
 * 4. Python: input(), sys.stdin (read, readline, readlines)
 * 5. JavaScript: fs.readFileSync(0, ...), process.stdin, readline (createInterface)
 */

/**
 * A single prompt/read pair detected in source code.
 * `prompt` is the literal string the program would print before reading.
 * An empty string means a read was found with no detectable preceding prompt.
 */
export interface PromptEntry {
  prompt: string;
}

/**
 * Strips line comments, block comments, and string literals from code
 * so that keywords mentioned inside comments or strings (e.g. printf("cin is cool"); // scanf here)
 * do not cause false positive input requirement detections.
 */
export function stripCommentsAndStrings(code: string, language: string): string {
  if (!code) return '';
  let result = '';
  let i = 0;
  const n = code.length;

  if (language === 'python') {
    while (i < n) {
      // Python comments
      if (code[i] === '#') {
        while (i < n && code[i] !== '\n') {
          i++;
        }
      } else if (code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") {
        // Triple quoted string
        const quote = code.slice(i, i + 3);
        i += 3;
        while (i < n && code.slice(i, i + 3) !== quote) {
          if (code[i] === '\\') i++;
          i++;
        }
        i += 3;
      } else if (code[i] === '"' || code[i] === "'") {
        // Single quoted string
        const quote = code[i++];
        while (i < n && code[i] !== quote && code[i] !== '\n') {
          if (code[i] === '\\') i++;
          i++;
        }
        if (i < n && code[i] === quote) i++;
      } else {
        result += code[i++];
      }
    }
    return result;
  }

  // C, C++, Java, JavaScript (C-style comments and strings)
  while (i < n) {
    if (code[i] === '/' && code[i + 1] === '/') {
      // Single line comment
      i += 2;
      while (i < n && code[i] !== '\n') {
        i++;
      }
    } else if (code[i] === '/' && code[i + 1] === '*') {
      // Multi line comment
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        i++;
      }
      i += 2;
    } else if (code[i] === '"' || code[i] === "'" || (language === 'javascript' && code[i] === '`')) {
      // String literal
      const quote = code[i++];
      while (i < n && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
      if (i < n && code[i] === quote) i++;
    } else {
      result += code[i++];
    }
  }

  return result;
}

/**
 * Checks whether the given source code in the specified language reasonably requires stdin.
 */
export function requiresStdin(code: string, language: string): boolean {
  if (!code || !code.trim()) return false;

  const cleanCode = stripCommentsAndStrings(code, language);

  switch (language.toLowerCase()) {
    case 'java': {
      // Scanner methods that read input:
      // .next(), .nextInt(), .nextLine(), .nextDouble(), .nextLong(), .hasNext(), .hasNextInt(), etc.
      // Or Direct System.in reads: System.in.read, InputStreamReader, BufferedReader reads
      const hasScannerRead = /\b(?:next(?:[A-Z][a-zA-Z]*)?|hasNext(?:[A-Z][a-zA-Z]*)?)\s*\(/.test(cleanCode);
      const hasSystemInRead = /\bSystem\s*\.\s*in\s*\.\s*read\s*\(/.test(cleanCode);
      const hasBufferedReaderRead = /\b(?:readLine|read)\s*\([^)]*\)/.test(cleanCode) && /\b(?:BufferedReader|InputStreamReader)\b/.test(cleanCode);
      const hasConsoleRead = /\b(?:readLine|readPassword)\s*\(/.test(cleanCode) && /\bConsole\b/.test(cleanCode);

      return hasScannerRead || hasSystemInRead || hasBufferedReaderRead || hasConsoleRead;
    }

    case 'c': {
      // Common C input functions:
      // scanf(...), scanf_s(...), getchar(), fgets(..., stdin), fscanf(stdin, ...), fread(..., stdin), getc(stdin), fgetc(stdin)
      const hasScanf = /\bscanf(?:_s)?\s*\(/.test(cleanCode);
      const hasGetchar = /\bgetchar\s*\(/.test(cleanCode);
      const hasGetc = /\b(?:fgetc|getc)\s*\(\s*stdin\b/.test(cleanCode);
      const hasFgets = /\bfgets\s*\([^,]+,[^,]+,\s*stdin\s*\)/.test(cleanCode);
      const hasFscanf = /\bfscanf\s*\(\s*stdin\b/.test(cleanCode);
      const hasFread = /\bfread\s*\([^,]+,[^,]+,[^,]+,\s*stdin\s*\)/.test(cleanCode);

      return hasScanf || hasGetchar || hasGetc || hasFgets || hasFscanf || hasFread;
    }

    case 'cpp': {
      // C++ input streams and functions:
      // cin >>, std::cin >>, getline(cin, ...), std::getline(std::cin, ...)
      // Plus C input functions (since C++ can use scanf, getchar, etc.)
      const hasCinOp = /\b(?:std\s*::\s*)?cin\s*>>/.test(cleanCode);
      const hasGetline = /\b(?:std\s*::\s*)?getline\s*\(\s*(?:std\s*::\s*)?cin\b/.test(cleanCode);
      const hasCinMethod = /\b(?:std\s*::\s*)?cin\s*\.\s*(?:get|getline|read|peek)\s*\(/.test(cleanCode);

      // C-style inputs in C++
      const hasCScanf = /\bscanf(?:_s)?\s*\(/.test(cleanCode);
      const hasCGetchar = /\bgetchar\s*\(/.test(cleanCode);
      const hasCFgets = /\bfgets\s*\([^,]+,[^,]+,\s*stdin\s*\)/.test(cleanCode);

      return hasCinOp || hasGetline || hasCinMethod || hasCScanf || hasCGetchar || hasCFgets;
    }

    case 'python': {
      // Python stdin mechanisms:
      // input(...), sys.stdin.read(...), sys.stdin.readline(...), sys.stdin.readlines(...)
      const hasInput = /\binput\s*\(/.test(cleanCode);
      const hasSysStdin = /\bsys\s*\.\s*stdin\s*(?:\.\s*(?:read|readline|readlines)|__iter__|\b)/.test(cleanCode);

      return hasInput || hasSysStdin;
    }

    case 'javascript': {
      // Node.js stdin mechanisms:
      // fs.readFileSync(0, ...), process.stdin, readline.createInterface({ input: process.stdin })
      const hasFdZeroRead = /\breadFileSync\s*\(\s*0\b/.test(cleanCode);
      const hasProcessStdin = /\bprocess\s*\.\s*stdin\b/.test(cleanCode);
      const hasReadlineStdin = /\bcreateInterface\b/.test(cleanCode) && /\binput\s*:\s*process\s*\.\s*stdin\b/.test(cleanCode);

      return hasFdZeroRead || hasProcessStdin || hasReadlineStdin;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Prompt detection helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a string literal value from a function argument.
 * Handles single-quoted, double-quoted, and (for JS) backtick strings.
 * Returns null if the argument is not a detectable string literal.
 */
function extractStringLiteral(raw: string): string | null {
  const trimmed = raw.trim();
  // Double-quoted
  const dq = trimmed.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (dq) return dq[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  // Single-quoted
  const sq = trimmed.match(/^'((?:[^'\\]|\\.)*)'$/);
  if (sq) return sq[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  // Backtick (JS template literal — only static ones)
  const bq = trimmed.match(/^`((?:[^`\\]|\\.)*)`$/);
  if (bq) return bq[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\`/g, '`').replace(/\\\\/g, '\\');
  return null;
}

/**
 * Detects prompt+read pairs in source code for the given language.
 *
 * Returns an ordered array of PromptEntry values — one per stdin read call found.
 * Each entry's `prompt` is the literal string the program would print immediately before reading.
 * An entry with an empty `prompt` means a read was found with no detectable preceding literal.
 *
 * Returns an empty array if:
 *   - The language has no stdin reads (use requiresStdin() first).
 *   - The prompt pattern is too dynamic / complex to analyse safely.
 *
 * IMPORTANT: this function NEVER invents prompts. If uncertain, it returns [].
 */
export function detectPrompts(code: string, language: string): PromptEntry[] {
  if (!code || !code.trim()) return [];

  try {
    switch (language.toLowerCase()) {
      case 'c':
        return detectPrompts_C(code);
      case 'cpp':
        return detectPrompts_CPP(code);
      case 'java':
        return detectPrompts_Java(code);
      case 'python':
        return detectPrompts_Python(code);
      case 'javascript':
        return detectPrompts_JS(code);
      default:
        return [];
    }
  } catch {
    // Any unexpected error → safe fallback
    return [];
  }
}

// ---------------------------------------------------------------------------
// C prompt detection
// C pattern: printf("Enter n: "); scanf(...)
//            or scanf without preceding printf → raw fallback
// ---------------------------------------------------------------------------
function detectPrompts_C(code: string): PromptEntry[] {
  const entries: PromptEntry[] = [];
  // Tokenise lines, skip line-comments and block-comments
  const cleanLines = removeLineAndBlockComments(code);
  // Split into statements (rough: split on ';')
  const statements = splitStatements(cleanLines);

  const promptBuffer: string[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();

    // printf("...") — capture string argument
    const printfRegex = /\bprintf\s*\(\s*(["'])(.+?)\1/gs;
    let pMatch: RegExpExecArray | null;
    let foundPrintf = false;
    while ((pMatch = printfRegex.exec(trimmed)) !== null) {
      foundPrintf = true;
      const raw = pMatch[1] + pMatch[2] + pMatch[1];
      const lit = extractStringLiteral(raw);
      if (lit !== null && isPromptString(lit)) {
        promptBuffer.push(lit);
      }
    }

    // scanf/scanf_s/getchar/fgets/fscanf/fread/getc/fgetc — these are the reads
    const isScanf = /\bscanf(?:_s)?\s*\(/.test(trimmed) || /\bfscanf\s*\(\s*stdin\b/.test(trimmed);
    const isOtherRead = /\bgetchar\s*\(/.test(trimmed) ||
      /\b(?:fgetc|getc)\s*\(\s*stdin\b/.test(trimmed) ||
      /\bfgets\s*\(/.test(trimmed) ||
      /\bfread\s*\(/.test(trimmed);

    if (isScanf || isOtherRead) {
      if (promptBuffer.length > 0) {
        let valueCount = 1;
        if (isScanf) {
          const detectedCount = countScanfValues(trimmed);
          if (detectedCount !== null) {
            valueCount = detectedCount;
          }
        }

        const mapped = mapPromptsToEntries(promptBuffer, valueCount);
        entries.push(...mapped);
        promptBuffer.length = 0;
      }
    } else if (foundPrintf) {
      continue;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// C++ prompt detection
// Supports: printf(...) and cout << "..." (with << chaining)
// ---------------------------------------------------------------------------
function detectPrompts_CPP(code: string): PromptEntry[] {
  const entries: PromptEntry[] = [];
  const cleanLines = removeLineAndBlockComments(code);
  const statements = splitStatements(cleanLines);

  const promptBuffer: string[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();

    let foundOutput = false;

    // cout << "..." (possibly chained; grab first string literal after <<)
    const coutMatch = trimmed.match(/\b(?:std\s*::\s*)?cout\s*<<\s*(["'`])(.*?)\1/s);
    if (coutMatch) {
      foundOutput = true;
      const raw = coutMatch[1] + coutMatch[2] + coutMatch[1];
      const lit = extractStringLiteral(raw);
      if (lit !== null && isPromptString(lit)) {
        promptBuffer.push(lit);
      }
    }

    // printf (C-style in C++)
    const printfRegex = /\bprintf\s*\(\s*(["'])(.+?)\1/gs;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = printfRegex.exec(trimmed)) !== null) {
      foundOutput = true;
      const raw = pMatch[1] + pMatch[2] + pMatch[1];
      const lit = extractStringLiteral(raw);
      if (lit !== null && isPromptString(lit)) {
        promptBuffer.push(lit);
      }
    }

    // cin >> or getline(cin, ...) or cin.get/read — reads
    const isCin = /\b(?:std\s*::\s*)?cin\s*>>/.test(trimmed);
    const isScanf = /\bscanf(?:_s)?\s*\(/.test(trimmed) || /\bfscanf\s*\(\s*stdin\b/.test(trimmed);
    const isOtherRead = /\b(?:std\s*::\s*)?getline\s*\(\s*(?:std\s*::\s*)?cin\b/.test(trimmed) ||
      /\b(?:std\s*::\s*)?cin\s*\.\s*(?:get|getline|read|peek)\s*\(/.test(trimmed) ||
      /\bgetchar\s*\(/.test(trimmed) ||
      /\bfgets\s*\(/.test(trimmed);

    if (isCin || isScanf || isOtherRead) {
      if (promptBuffer.length > 0) {
        let valueCount = 1;
        if (isCin) {
          const detectedCount = countCinValues(trimmed);
          if (detectedCount !== null) {
            valueCount = detectedCount;
          }
        } else if (isScanf) {
          const detectedCount = countScanfValues(trimmed);
          if (detectedCount !== null) {
            valueCount = detectedCount;
          }
        }

        const mapped = mapPromptsToEntries(promptBuffer, valueCount);
        entries.push(...mapped);
        promptBuffer.length = 0;
      }
    } else if (foundOutput) {
      continue;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Java prompt detection
// System.out.print("..."); or System.out.println("...")
// followed by scanner.nextInt() etc.
// ---------------------------------------------------------------------------
function detectPrompts_Java(code: string): PromptEntry[] {
  const entries: PromptEntry[] = [];
  const cleanLines = removeLineAndBlockComments(code);
  const statements = splitStatements(cleanLines);

  const promptBuffer: string[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();

    // System.out.print("...") or System.out.println("...")
    const printMatch = trimmed.match(/\bSystem\s*\.\s*out\s*\.\s*print(?:ln|f)?\s*\(\s*(["'])(.*?)\1/s);
    if (printMatch) {
      const raw = printMatch[1] + printMatch[2] + printMatch[1];
      const lit = extractStringLiteral(raw);
      if (lit !== null && isPromptString(lit)) {
        promptBuffer.push(lit);
      }
      continue;
    }

    // Scanner reads: next(), nextInt(), nextLine(), nextDouble(), nextLong() etc.
    // Also BufferedReader.readLine(), System.in.read()
    const isRead = /\bnext(?:[A-Z][a-zA-Z]*)?\s*\(/.test(trimmed) ||
      /\breadLine\s*\(/.test(trimmed) ||
      /\bSystem\s*\.\s*in\s*\.\s*read\s*\(/.test(trimmed);

    if (isRead) {
      if (promptBuffer.length > 0) {
        const prompt = promptBuffer.shift() ?? '';
        entries.push({ prompt });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Python prompt detection
// input("prompt") — the argument IS the prompt
// print("prompt") followed by input() (no-arg)
// ---------------------------------------------------------------------------
function detectPrompts_Python(code: string): PromptEntry[] {
  const entries: PromptEntry[] = [];
  // Remove Python line comments
  const lines = code.split('\n');
  const cleanLines: string[] = [];
  for (const line of lines) {
    // Strip inline # comments (naively, but good enough for prompt detection)
    const stripped = line.replace(/#.*$/, '');
    cleanLines.push(stripped);
  }
  const cleanCode = cleanLines.join('\n');

  // Find all input(...) calls
  // Match input( ... ) where we capture the argument
  const inputRegex = /\binput\s*\(\s*((?:"[^"]*"|'[^']*')?)\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = inputRegex.exec(cleanCode)) !== null) {
    const argRaw = match[1].trim();
    if (argRaw) {
      const lit = extractStringLiteral(argRaw);
      if (lit !== null && isPromptString(lit)) {
        entries.push({ prompt: lit });
      }
    } else {
      // input() with no argument — check for the most recent preceding print() call
      const precedingCode = cleanCode.slice(0, match.index);
      // Find ALL print(...) calls and take the last one
      const printAllRe = /\bprint\s*\(\s*(["'])(.*?)\1\s*\)/g;
      let lastPrint: RegExpExecArray | null = null;
      let pm: RegExpExecArray | null;
      while ((pm = printAllRe.exec(precedingCode)) !== null) {
        lastPrint = pm;
      }
      if (lastPrint) {
        const raw = lastPrint[1] + lastPrint[2] + lastPrint[1];
        const lit = extractStringLiteral(raw);
        if (lit !== null && isPromptString(lit)) {
          entries.push({ prompt: lit });
        }
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// JavaScript prompt detection
// console.log("prompt") before readline / process.stdin reads
// ---------------------------------------------------------------------------
function detectPrompts_JS(code: string): PromptEntry[] {
  const entries: PromptEntry[] = [];
  const cleanLines = removeLineAndBlockComments(code);
  const statements = splitStatements(cleanLines);

  const promptBuffer: string[] = [];

  for (const stmt of statements) {
    const trimmed = stmt.trim();

    // console.log("...")
    const logMatch = trimmed.match(/\bconsole\s*\.\s*log\s*\(\s*(["'`])(.*?)\1/s);
    if (logMatch) {
      const raw = logMatch[1] + logMatch[2] + logMatch[1];
      const lit = extractStringLiteral(raw);
      if (lit !== null && isPromptString(lit)) {
        promptBuffer.push(lit);
      }
      continue;
    }

    // readline / process.stdin reads
    const isRead = /\breadFileSync\s*\(\s*0\b/.test(trimmed) ||
      /\bprocess\s*\.\s*stdin\b/.test(trimmed) ||
      /\brl\s*\.\s*question\s*\(/.test(trimmed) ||
      /\brl\s*\.\s*on\s*\(/.test(trimmed) ||
      /\breadline(?:Sync)?\s*\(/.test(trimmed);

    if (isRead) {
      if (promptBuffer.length > 0) {
        const prompt = promptBuffer.shift() ?? '';
        entries.push({ prompt });
      }
    }
  }

  return entries;
}

/**
 * Determines whether a string literal printed before a read is confidently
 * identifiable as a user-input prompt rather than ordinary program output.
 *
 * Rules:
 * - Must NOT match known non-prompt / output patterns (e.g. "Hello", "Result:", "Sum:", "Output:", etc.)
 * - Must either:
 *   1. Contain an explicit input action keyword: 'enter', 'input', 'type', 'give', 'insert', 'provide', 'choose', 'select', 'specify', 'read'
 *   2. Or end with prompt punctuation (':', '?', '>', '=') and look like a short field label (e.g. 'Name: ', 'Age: ', 'Value: ', 'n = ')
 * - Prefer false-negative (Raw fallback) over false-positive (fabricated prompt UI).
 */
export function isPromptString(raw: string): boolean {
  if (!raw || !raw.trim()) return false;
  const trimmed = raw.trim();

  // Negative check: Output/result/status prefixes or greetings
  const outputPattern = /^(?:hello|hi|welcome|result|output|answer|the\s+(?:result|sum|answer|output)|sum|total|product|quotient|diff|difference|average|square|error|warning|success|done|finished|bye|goodbye)\b/i;
  if (outputPattern.test(trimmed)) {
    return false;
  }

  // Positive check 1: Contains explicit input action keyword
  const actionKeyword = /\b(?:enter|input|type|give|insert|provide|choose|select|specify|read)\b/i;
  if (actionKeyword.test(trimmed)) {
    return true;
  }

  // Positive check 2: Ends with prompt punctuation (':', '?', '>', '=')
  // and is a short label (<= 40 characters) without newlines in the middle
  const endsWithPromptPunctuation = /[:?>=]$/.test(trimmed);
  if (endsWithPromptPunctuation && trimmed.length <= 40 && !trimmed.includes('\n')) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Remove C-style line comments and block comments from code.
 * Preserves newlines for line numbering.
 */
function removeLineAndBlockComments(code: string): string {
  let result = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    // Line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < n && code[i] !== '\n') i++;
    // Block comment
    } else if (code[i] === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') result += '\n'; // preserve newlines
        i++;
      }
      i += 2;
    // String literal — keep in result for regex matching but skip body for comment detection
    } else if (code[i] === '"' || code[i] === "'") {
      const q = code[i++];
      result += q;
      while (i < n && code[i] !== q) {
        if (code[i] === '\\') { result += code[i++]; }
        result += code[i++];
      }
      if (i < n) { result += code[i++]; }
    } else {
      result += code[i++];
    }
  }
  return result;
}

/**
 * Split code into rough statements by semicolons and newlines.
 * Good enough for sequential statement analysis.
 */
function splitStatements(code: string): string[] {
  // Split on semicolons, keeping content together
  return code.split(';').map(s => s.trim()).filter(Boolean);
}

/**
 * Counts how many input values a scanf statement consumes by parsing format specifiers.
 * Returns null if the format string cannot be reliably determined as a string literal.
 */
function countScanfValues(stmt: string): number | null {
  const scanfRegex = /\b(?:scanf(?:_s)?\s*\(\s*|fscanf\s*\(\s*stdin\s*,\s*)(["'])(.*?)\1/gs;
  let match: RegExpExecArray | null;
  let totalSpecifiers = 0;
  let foundAny = false;

  while ((match = scanfRegex.exec(stmt)) !== null) {
    foundAny = true;
    const fmt = match[2];
    // Strip escaped percent signs (%%)
    const withoutEscapedPercent = fmt.replace(/%%/g, '');
    // Match standard C format specifiers: %[*][width][length]type
    // type can be d, i, u, o, x, X, f, F, e, E, g, G, a, A, c, s, p, or scanset [...]
    const specifiers = withoutEscapedPercent.match(/%(\*?)(?:\d+)?(?:hh|ll|[hljztL])?([diuoxXeEfgGaAcsp]|\[[^\]]*\])/g);
    if (specifiers && specifiers.length > 0) {
      totalSpecifiers += specifiers.length;
    } else {
      totalSpecifiers += 1; // At least 1 value per scanf call
    }
  }

  if (!foundAny) return null;
  return Math.max(1, totalSpecifiers);
}

/**
 * Counts how many values a cin extraction statement consumes.
 * E.g., `cin >> a >> b` consumes 2 values.
 */
function countCinValues(stmt: string): number | null {
  if (!/\b(?:std\s*::\s*)?cin\s*>>/.test(stmt)) return null;
  const matches = stmt.match(/>>/g);
  return matches ? Math.max(1, matches.length) : 1;
}

/**
 * Maps buffered prompts to input fields in order.
 * - If promptBuffer has more prompts than values, takes the last `valueCount` prompts (closest to read).
 * - If promptBuffer has fewer prompts than values, fills available in order and pads with empty prompts.
 * - Never fabricates prompts.
 */
function mapPromptsToEntries(promptBuffer: string[], valueCount: number): PromptEntry[] {
  const count = Math.max(1, valueCount);
  const entries: PromptEntry[] = [];

  if (promptBuffer.length >= count) {
    const selected = promptBuffer.slice(promptBuffer.length - count);
    for (const p of selected) {
      entries.push({ prompt: p });
    }
  } else {
    for (let i = 0; i < count; i++) {
      const p = i < promptBuffer.length ? promptBuffer[i] : '';
      entries.push({ prompt: p });
    }
  }

  return entries;
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts a detected prompt string into a safe regular expression.
 * Handles printf format specifiers (e.g. `%d` matching a runtime number).
 * If the prompt cannot be converted safely, returns null.
 */
function createPromptRegex(prompt: string): RegExp | null {
  if (!prompt || !prompt.trim()) return null;

  // Pattern matching C/Java printf format specifiers:
  // %[flags][width][.precision][length]specifier
  const specifierRegex = /%(?:\d+\$)?[-+ 0#]*\d*(?:\.\d+)?(?:hh|ll|[hljztL])?([diuoxXeEfgGaAcsp])/g;

  let lastIndex = 0;
  let pattern = '';
  let match: RegExpExecArray | null;

  while ((match = specifierRegex.exec(prompt)) !== null) {
    // Escape the literal portion before the specifier
    const literalPart = prompt.slice(lastIndex, match.index);
    pattern += escapeRegex(literalPart);

    // Replace the format specifier with an appropriate pattern
    const spec = match[1];
    if (/[diuoxX]/.test(spec)) {
      pattern += '-?\\d+';
    } else if (/[fFeEgGaA]/.test(spec)) {
      pattern += '-?\\d+(?:\\.\\d+)?';
    } else if (spec === 'c') {
      pattern += '.';
    } else if (spec === 's') {
      pattern += '\\S+';
    } else if (spec === 'p') {
      pattern += '(?:0x[0-9a-fA-F]+|\\(nil\\)|[0-9a-fA-F]+)';
    } else {
      pattern += '.*?';
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing literal portion
  const remainingLiteral = prompt.slice(lastIndex);
  pattern += escapeRegex(remainingLiteral);

  // Allow optional trailing newline if the prompt was followed by newline
  pattern += '(?:\r?\n)?';

  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Strips detected prompt strings from stdout for presentation in OutputPanel.
 * Only called when prompt-aware mode is active.
 * Each detected prompt is removed at most once, in the order detected.
 * If a prompt does not match runtime output, stdout is left intact.
 */
export function cleanPromptOutput(stdout: string, promptEntries: PromptEntry[]): string {
  if (!stdout || !promptEntries || promptEntries.length === 0) {
    return stdout;
  }

  let cleaned = stdout;

  for (const entry of promptEntries) {
    const promptText = entry.prompt;
    if (!promptText || !promptText.trim()) continue;

    const regex = createPromptRegex(promptText);
    if (!regex) continue;

    // Find the first occurrence of this prompt in cleaned stdout
    const match = cleaned.match(regex);
    if (match && match.index !== undefined) {
      // Remove only this occurrence
      cleaned = cleaned.slice(0, match.index) + cleaned.slice(match.index + match[0].length);
    }
  }

  return cleaned;
}
