// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import builtin from '../data/builtin-functions.json'; // file contains the builtin function descriptions

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension is now active!');

    vscode.languages.registerHoverProvider('amiga-e', {
        provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position);
            if (!range) return undefined // no word found

            const endPos = range.end
            const nextChar = document.lineAt(endPos.line).text[endPos.character]
            if (nextChar != "(") return undefined // the word is not a function because the next char is not an opening bracket

            const word = document.getText(range); // this is the function name

            /*
            type FunctionName = string
            type FunctionDescription = string

            const functionsTable: Record<FunctionName, FunctionDescription> = {
                String: "```amiga-e\ns:=String(maxlen)\n```\n\n`DEF s[80]:STRING` is equivalent to `DEF s` and `s:=String(80)`",
                StrCmp: "```amiga-e\nbool:=StrCmp(string,string,len=ALL)\n```\n\ncompares two strings. `len` must be the number of bytes to compare,\n\nor 'ALL' if the full length is to be compared. Returns `TRUE` or `FALSE`\n\n(len is a default argument (see  6F ))",
                StrCopy: "```amiga-e\nStrCopy(estring,string,len=ALL)\n```\n\ncopies the string into the estring. If `len=ALL`, all will be copied.\n\nreturns the `estring`.",
                StrAdd: "```amiga-e\nStrAdd(estring,string,len=ALL)\n```\n\nsame as `StrCopy()`, only now the string is concatenated to the end.\n\nreturns the `estring`.",
                StrAddChar: "```amiga-e\nStrAddChar(estring,char)\n```\n\nSame as `StrAdd()` but adds a single character onto the end of an estring.",
                StrLen: "```amiga-e\nlen:=StrLen(string)\n```\n\ncalculates the length of any zero-terminated string",
                EstrLen: "```amiga-e\nlen:=EstrLen(estring)\n```\n\nreturns the length of an estring",
                StrMax: "```amiga-e\nmax:=StrMax(estring)\n```\n\nreturns the maximum length of a estring",
                StringF: "```amiga-e\nStringF(estring,fmtstring,args,...)\n```\n\nsimilar to `WriteF()`, only now output goes to `estring` instead of stdout.\n\nexample:\n```amiga-e\nStringF(s,'result: \\d\\n',123)\n```\n\n's' will be 'result: 123\n'\n\nreturns the `estring`, and length as second returnvalue.",
                AstringF: "```amiga-e\nAstringF(string,fmtstring,args,...)\n```\n\narray string version of `StringF()`. So no length checking is done so make sure\n\nthe output string is long enough or you will end up with memory corruption.",
                RightStr: "```amiga-e\nRightStr(estring,estring,n)\n```\n\nfills `estring` with the last `n` characters of the second `estring`\n\nreturns the `estring`.",
                MidStr: "```amiga-e\nMidStr(estring,string,pos,len=ALL)\n```\n\ncopies any number of characters (including all if `len=ALL`) from\n\nposition `pos` in `string` to `estring`\n\nNOTEZ BIEN: in all string related functions where a position in a\n\nstring is used, the first character in a string has position 0,\n\nnot 1, as is common in languages like BASIC.\n\nreturns the `estring`."
            };
            const functionMapper = (f: FunctionName): FunctionDescription | undefined => functionsTable[f] || undefined;

            const description = functionMapper(word);
            if (!description) return undefined // function description not found
            */

            //TODO: add function bracked colors to syntax highlighting

            const keywordIndex = builtin.NotepadPlus.AutoComplete.KeyWord.findIndex((x) => x._name === word);
            if (keywordIndex == -1) return undefined // function not found

            const keyword = builtin.NotepadPlus.AutoComplete.KeyWord[keywordIndex];

            var description = "```amiga-e\n" // start of syntax highlighting
            description += keyword._name + "(" // function name and opening bracket

            if (keyword.Overload && keyword.Overload.Param) {
                if (Array.isArray(keyword.Overload.Param)) {
                    // multiple parameters
                    keyword.Overload.Param.forEach((element, index, array) => {
                        description += element._name; // parameter name
                        if (index != array.length - 1) {
                            description += builtin.NotepadPlus.AutoComplete.Environment._paramSeparator; // add separater sign
                        }
                    });
                    // remove last separator
                }
                else {
                    // only one parameter
                    description += keyword.Overload.Param._name
                }
            }

            description += ")" // the closing bracket

            if (keyword.Overload?._retVal) {
                description += ":" + keyword.Overload?._retVal // the return value
            }

            description += "\n```\n" // the end of syntax highlighting
            description += keyword.Overload?._descr // this is the description

            const md = new vscode.MarkdownString(description);

            return new vscode.Hover(md);
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() { }