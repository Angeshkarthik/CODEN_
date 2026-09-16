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
