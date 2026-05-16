import * as vscode from 'vscode';

export class AmigaEDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        const objectStack: Array<{ symbol: vscode.DocumentSymbol; startLine: number; currentVisibility: 'public' | 'private' }> = [];
        const procStack: Array<{ symbol: vscode.DocumentSymbol; startLine: number }> = [];

        for (let line = 0; line < document.lineCount; line++) {
            const lineText = document.lineAt(line).text;
            const trimmed = lineText.trim();

            if (!trimmed || trimmed.startsWith('->')) {
                continue;
            }

            // MODULE is intentionally not represented as a declaration symbol.

            // OBJECT declarations only contain field declarations (not PROC implementations).
            const objectMatch = /^\s*(EXPORT\s+)?OBJECT\s+([A-Za-z_][A-Za-z0-9_]*)\b/i.exec(lineText);
            if (objectMatch) {
                const isExported = !!objectMatch[1];
                const objectName = objectMatch[2];
                const symbol = this.createLineSymbol(
                    objectName,
                    vscode.SymbolKind.Class,
                    line,
                    lineText,
                    objectName,
                    this.prependExportDetail(undefined, isExported)
                );
                symbols.push(symbol);
                objectStack.push({ symbol, startLine: line, currentVisibility: 'public' });
                continue;
            }

            if (/^\s*ENDOBJECT\b/i.test(lineText)) {
                const pendingObject = objectStack.pop();
                if (pendingObject) {
                    pendingObject.symbol.range = new vscode.Range(
                        pendingObject.startLine,
                        0,
                        line,
                        document.lineAt(line).text.length
                    );
                }
                continue;
            }

            // PROC methods attached to objects are declared as: PROC name(args) OF ObjectName
            const procMatch = /^\s*(EXPORT\s+)?PROC\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?\s*(?:OF\s+([A-Za-z_][A-Za-z0-9_]*))?/i.exec(lineText);
            if (procMatch) {
                const isExported = !!procMatch[1];
                const procName = procMatch[2];
                const args = procMatch[3] ?? '()';
                const objectName = procMatch[4];
                const argTypesSignature = this.formatArgTypesSignature(args);
                const procDetail = this.prependExportDetail(objectName || undefined, isExported);

                const symbol = this.createLineSymbol(
                    objectName ? `${procName}${argTypesSignature}` : procName,
                    objectName ? vscode.SymbolKind.Method : vscode.SymbolKind.Function,
                    line,
                    lineText,
                    procName,
                    procDetail
                );
                symbols.push(symbol);

                // Inline PROC ... IS ... has no ENDPROC block.
                if (!/\bIS\b/i.test(lineText)) {
                    procStack.push({ symbol, startLine: line });
                }
                continue;
            }

            if (/^\s*ENDPROC\b/i.test(lineText)) {
                const pendingProc = procStack.pop();
                if (pendingProc) {
                    const endLine = this.findTrailingCommaContinuationEnd(document, line);
                    pendingProc.symbol.range = new vscode.Range(
                        pendingProc.startLine,
                        0,
                        endLine,
                        document.lineAt(endLine).text.length
                    );
                }
                continue;
            }

            // ENUM values in Amiga E are auto-valued constants.
            const enumMatch = /^\s*(EXPORT\s+)?ENUM\b(.*)$/i.exec(lineText);
            if (enumMatch) {
                const isExported = !!enumMatch[1];
                const enumTail = enumMatch[2] ?? '';
                const currentContainer = procStack.length > 0
                    ? procStack[procStack.length - 1].symbol
                    : objectStack.length > 0
                        ? objectStack[objectStack.length - 1].symbol
                        : undefined;
                this.addListSymbols(
                    document,
                    symbols,
                    enumTail,
                    line,
                    lineText,
                    vscode.SymbolKind.Constant,
                    this.prependExportDetail('enum constant', isExported),
                    currentContainer
                );
                continue;
            }

            const setMatch = /^\s*(EXPORT\s+)?SET\b(.*)$/i.exec(lineText);
            if (setMatch) {
                const isExported = !!setMatch[1];
                const setTail = setMatch[2] ?? '';
                const currentContainer = procStack.length > 0
                    ? procStack[procStack.length - 1].symbol
                    : objectStack.length > 0
                        ? objectStack[objectStack.length - 1].symbol
                        : undefined;
                this.addListSymbols(
                    document,
                    symbols,
                    setTail,
                    line,
                    lineText,
                    vscode.SymbolKind.Constant,
                    this.prependExportDetail('set constant', isExported),
                    currentContainer
                );
                continue;
            }

            const constMatch = /^\s*(EXPORT\s+)?CONST\b(.*)$/i.exec(lineText);
            if (constMatch) {
                const isExported = !!constMatch[1];
                const constTail = constMatch[2] ?? '';
                const currentContainer = procStack.length > 0
                    ? procStack[procStack.length - 1].symbol
                    : objectStack.length > 0
                        ? objectStack[objectStack.length - 1].symbol
                        : undefined;
                this.addListSymbols(
                    document,
                    symbols,
                    constTail,
                    line,
                    lineText,
                    vscode.SymbolKind.Constant,
                    this.prependExportDetail('constant', isExported),
                    currentContainer
                );
                continue;
            }

            const defMatch = /^\s*(EXPORT\s+)?DEF\b(.*)$/i.exec(lineText);
            if (defMatch) {
                const isExported = !!defMatch[1];
                const defTail = defMatch[2] ?? '';
                const currentProc = procStack.length > 0 ? procStack[procStack.length - 1].symbol : undefined;
                this.addDefSymbols(
                    document,
                    symbols,
                    defTail,
                    line,
                    lineText,
                    currentProc,
                    this.prependExportDetail(undefined, isExported)
                );
                continue;
            }

            // Fields declared inside OBJECT block.
            const currentObject = objectStack[objectStack.length - 1];
            if (currentObject) {
                let fieldVisibility: 'public' | 'private' = currentObject.currentVisibility;
                let declarationText = lineText;

                const visibilityDirective = /^\s*(PRIVATE|PUBLIC)\b\s*(.*)$/i.exec(lineText);
                if (visibilityDirective) {
                    const directive = visibilityDirective[1].toUpperCase() === 'PRIVATE' ? 'private' : 'public';
                    currentObject.currentVisibility = directive;
                    fieldVisibility = directive;
                    declarationText = visibilityDirective[2] ?? '';
                }

                const fieldMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?\s*:/i.exec(declarationText);
                if (fieldMatch) {
                    const fieldName = fieldMatch[1];
                    const fieldSymbol = this.createLineSymbol(
                        fieldName,
                        vscode.SymbolKind.Field,
                        line,
                        lineText,
                        fieldName,
                        fieldVisibility === 'private' ? 'private' : undefined
                    );
                    currentObject.symbol.children.push(fieldSymbol);
                }
            }
        }

        const lastLine = document.lineCount - 1;
        const lastCol = lastLine >= 0 ? document.lineAt(lastLine).text.length : 0;

        for (const pendingProc of procStack) {
            pendingProc.symbol.range = new vscode.Range(pendingProc.startLine, 0, lastLine, lastCol);
        }

        for (const pendingObject of objectStack) {
            pendingObject.symbol.range = new vscode.Range(pendingObject.startLine, 0, lastLine, lastCol);
        }

        return symbols;
    }

    private addListSymbols(
        document: vscode.TextDocument,
        symbols: vscode.DocumentSymbol[],
        declarationTail: string,
        lineNumber: number,
        lineText: string,
        kind: vscode.SymbolKind,
        detail?: string,
        parentSymbol?: vscode.DocumentSymbol
    ) {
        const names = this.extractDeclaredNames(declarationTail);
        for (const name of names) {
            this.appendSymbol(symbols, this.createLineSymbol(name, kind, lineNumber, lineText, name, detail), parentSymbol);
        }

        // Support continued declaration lines that end with a comma.
        if (!declarationTail.trimEnd().endsWith(',')) {
            return;
        }

        for (let nextLine = lineNumber + 1; nextLine < document.lineCount; nextLine++) {
            const continuationText = document.lineAt(nextLine).text;
            const continuationTrimmed = continuationText.trim();
            if (!continuationTrimmed || continuationTrimmed.startsWith('->')) {
                continue;
            }

            if (/^\s*(?:EXPORT\s+)?(OBJECT|ENDOBJECT|PROC|ENDPROC|CONST|ENUM|SET|DEF|MODULE|SECTION|LIBRARY)\b/i.test(continuationText)) {
                break;
            }

            const continuationNames = this.extractDeclaredNames(continuationText);
            for (const name of continuationNames) {
                this.appendSymbol(symbols, this.createLineSymbol(name, kind, nextLine, continuationText, name, detail), parentSymbol);
            }

            if (!continuationTrimmed.endsWith(',')) {
                break;
            }
        }
    }

    private extractDeclaredNames(text: string): string[] {
        const withoutComment = text.replace(/->.*$/, '');
        const parts = withoutComment.split(',');
        const names: string[] = [];

        for (const rawPart of parts) {
            const part = rawPart.trim();
            if (!part) {
                continue;
            }

            const nameMatch = /([A-Za-z_][A-Za-z0-9_]*)/.exec(part);
            if (nameMatch) {
                names.push(nameMatch[1]);
            }
        }

        return names;
    }

    private addDefSymbols(
        document: vscode.TextDocument,
        symbols: vscode.DocumentSymbol[],
        declarationTail: string,
        lineNumber: number,
        lineText: string,
        parentSymbol?: vscode.DocumentSymbol,
        detail?: string
    ) {
        const defLines: Array<{ text: string; lineNumber: number; lineText: string }> = [
            { text: declarationTail, lineNumber, lineText }
        ];

        if (declarationTail.trimEnd().endsWith(',')) {
            for (let nextLine = lineNumber + 1; nextLine < document.lineCount; nextLine++) {
                const continuationText = document.lineAt(nextLine).text;
                const continuationTrimmed = continuationText.trim();
                if (!continuationTrimmed || continuationTrimmed.startsWith('->')) {
                    continue;
                }

                if (/^\s*(?:EXPORT\s+)?(OBJECT|ENDOBJECT|PROC|ENDPROC|CONST|ENUM|SET|DEF|MODULE|SECTION|LIBRARY)\b/i.test(continuationText)) {
                    break;
                }

                defLines.push({ text: continuationText, lineNumber: nextLine, lineText: continuationText });
                if (!continuationTrimmed.endsWith(',')) {
                    break;
                }
            }
        }

        const pendingUntyped: Array<{ name: string; lineNumber: number; lineText: string }> = [];

        for (const defLine of defLines) {
            const withoutComment = defLine.text.replace(/->.*$/, '');
            const parts = withoutComment.split(',');

            for (const rawPart of parts) {
                const part = rawPart.trim();
                if (!part) {
                    continue;
                }

                const cleanPart = part.replace(/\s*=.*$/, '').trim();
                const colonIndex = cleanPart.lastIndexOf(':');

                if (colonIndex === -1) {
                    const names = this.extractDeclaredVariableNames(cleanPart);
                    for (const name of names) {
                        pendingUntyped.push({ name, lineNumber: defLine.lineNumber, lineText: defLine.lineText });
                    }
                    continue;
                }

                const namesPart = cleanPart.slice(0, colonIndex).trim();
                const declaredType = cleanPart.slice(colonIndex + 1).trim() || 'LONG';
                const typedNames = this.extractDeclaredVariableNames(namesPart);

                for (const pending of pendingUntyped) {
                    this.appendSymbol(symbols, this.createLineSymbol(
                        pending.name,
                        vscode.SymbolKind.Variable,
                        pending.lineNumber,
                        pending.lineText,
                        pending.name,
                        detail
                    ), parentSymbol);
                }
                pendingUntyped.length = 0;

                for (const name of typedNames) {
                    this.appendSymbol(symbols, this.createLineSymbol(
                        name,
                        vscode.SymbolKind.Variable,
                        defLine.lineNumber,
                        defLine.lineText,
                        name,
                        detail
                    ), parentSymbol);
                }
            }
        }

        for (const pending of pendingUntyped) {
            this.appendSymbol(symbols, this.createLineSymbol(
                pending.name,
                vscode.SymbolKind.Variable,
                pending.lineNumber,
                pending.lineText,
                pending.name,
                detail
            ), parentSymbol);
        }
    }

    private prependExportDetail(detail: string | undefined, isExported: boolean): string | undefined {
        if (!isExported) {
            return detail;
        }

        if (!detail) {
            return 'export';
        }

        return `export ${detail}`;
    }

    private findTrailingCommaContinuationEnd(document: vscode.TextDocument, startLine: number): number {
        let endLine = startLine;

        if (!document.lineAt(startLine).text.trimEnd().endsWith(',')) {
            return endLine;
        }

        for (let line = startLine + 1; line < document.lineCount; line++) {
            endLine = line;
            if (!document.lineAt(line).text.trimEnd().endsWith(',')) {
                break;
            }
        }

        return endLine;
    }

    private appendSymbol(
        rootSymbols: vscode.DocumentSymbol[],
        symbol: vscode.DocumentSymbol,
        parentSymbol?: vscode.DocumentSymbol
    ) {
        if (parentSymbol) {
            parentSymbol.children.push(symbol);
            return;
        }

        rootSymbols.push(symbol);
    }

    private formatArgTypesSignature(argsWithParens: string): string {
        const argsText = argsWithParens.trim();
        if (!argsText.startsWith('(') || !argsText.endsWith(')')) {
            return '()';
        }

        const inner = argsText.slice(1, -1).trim();
        if (!inner) {
            return '()';
        }

        const parts = inner.split(',');
        const typeList: string[] = [];
        let pendingUntyped = 0;

        for (const rawPart of parts) {
            const part = rawPart.trim();
            if (!part) {
                continue;
            }

            const cleanPart = part.replace(/\s*=.*$/, '').trim();
            const colonIndex = cleanPart.lastIndexOf(':');

            if (colonIndex === -1) {
                pendingUntyped++;
                continue;
            }

            const namesPart = cleanPart.slice(0, colonIndex).trim();
            const typePart = cleanPart.slice(colonIndex + 1).trim();
            if (!typePart) {
                pendingUntyped++;
                continue;
            }

            const explicitNames = namesPart
                .split(/\s+/)
                .map((token) => token.trim())
                .filter((token) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)).length;

            const repeat = Math.max(1, explicitNames) + pendingUntyped;
            for (let i = 0; i < repeat; i++) {
                typeList.push(typePart);
            }
            pendingUntyped = 0;
        }

        while (pendingUntyped > 0) {
            typeList.push('LONG');
            pendingUntyped--;
        }

        return `(${typeList.join(', ')})`;
    }

    private extractDeclaredVariableNames(text: string): string[] {
        const names: string[] = [];
        const nameRegex = /([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?/g;

        for (const match of text.matchAll(nameRegex)) {
            const name = match[1];
            if (name) {
                names.push(name);
            }
        }

        return names;
    }

    private createLineSymbol(
        name: string,
        kind: vscode.SymbolKind,
        lineNumber: number,
        lineText: string,
        selectionNeedle: string,
        detail?: string
    ): vscode.DocumentSymbol {
        const lineLength = lineText.length;
        const range = new vscode.Range(lineNumber, 0, lineNumber, lineLength);

        const needleIndex = lineText.toLowerCase().indexOf(selectionNeedle.toLowerCase());
        const selectionStart = needleIndex >= 0 ? needleIndex : 0;
        const selectionEnd = needleIndex >= 0 ? needleIndex + selectionNeedle.length : Math.min(name.length, lineLength);
        const selectionRange = new vscode.Range(lineNumber, selectionStart, lineNumber, selectionEnd);

        return new vscode.DocumentSymbol(name, detail ?? '', kind, range, selectionRange);
    }
}
