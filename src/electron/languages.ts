import { LanguageConfig } from './types';

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  java: {
    id: 'java',
    name: 'Java',
    extension: '.java',
    monacoLanguage: 'java',
    fileName: 'Main.java',
    requiresCompilation: true,
    compilerCommand: 'javac',
    compilerArgs: (sourceFile: string) => [sourceFile],
    runtimeCommand: 'java',
    runtimeArgs: () => ['Main'],
    versionCheck: { command: 'javac', args: ['-version'] },
    defaultCode: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        // Write your code here

        sc.close();
    }
}`
  },
  c: {
    id: 'c',
    name: 'C',
    extension: '.c',
    monacoLanguage: 'c',
    fileName: 'Main.c',
    requiresCompilation: true,
    compilerCommand: 'gcc',
    compilerArgs: (sourceFile: string, outputFile: string) => [sourceFile, '-o', outputFile],
    runtimeCommand: 'Main.exe',
    runtimeArgs: () => [],
    versionCheck: { command: 'gcc', args: ['--version'] },
    defaultCode: `#include <stdio.h>

int main() {
    // Write your code here

    return 0;
}`
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    extension: '.cpp',
    monacoLanguage: 'cpp',
    fileName: 'Main.cpp',
    requiresCompilation: true,
    compilerCommand: 'g++',
    compilerArgs: (sourceFile: string, outputFile: string) => [sourceFile, '-o', outputFile],
    runtimeCommand: 'Main.exe',
    runtimeArgs: () => [],
    versionCheck: { command: 'g++', args: ['--version'] },
    defaultCode: `#include <iostream>
using namespace std;

int main() {
    // Write your code here

    return 0;
}`
  },
  python: {
    id: 'python',
    name: 'Python',
    extension: '.py',
    monacoLanguage: 'python',
    fileName: 'Main.py',
    requiresCompilation: false,
    runtimeCommand: 'python',
    runtimeArgs: (targetFile: string) => [targetFile],
    versionCheck: { command: 'python', args: ['--version'] },
    defaultCode: `# Write your code here
`
  },
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    extension: '.js',
    monacoLanguage: 'javascript',
    fileName: 'Main.js',
    requiresCompilation: false,
    runtimeCommand: 'node',
    runtimeArgs: (targetFile: string) => [targetFile],
    versionCheck: { command: 'node', args: ['--version'] },
    defaultCode: `// Write your code here
`
  }
};
