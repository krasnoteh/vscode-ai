const vscode = require('vscode');
const axios = require('axios');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * @param {vscode.ExtensionContext} context
 */

let statusBarItem;
var line = 1;
var global_response = " ";

function activate(context) {
	var access_token;
	var time = 0;
	var message = " "
	
	let disposable_settings = vscode.commands.registerCommand('vs-code-ai.opensettings', function () {
		vscode.commands.executeCommand('workbench.action.openSettings', 'VS Code AI');
	});

	let disposable_setprompt = vscode.commands.registerCommand('vs-code-ai.setprompt', async function () {
		const prompt = await vscode.window.showInputBox({
            placeHolder: 'Enter a prompt...',
            prompt: 'Enter a prompt for VS Code AI ',
            value: '' 
        });
		if (prompt) {
            message = prompt;
            vscode.window.showInformationMessage(`VS Code AI включен. Задача: ${prompt}`);
        } else {
            vscode.window.showErrorMessage('Вы не ввели задачу!');
        }

	});

	let disposable_generate = vscode.commands.registerCommand('vs-code-ai.generate_responce', async function () {
		const ExtensionConfig = vscode.workspace.getConfiguration('VS Code AI configuration');

		const authorization_data = ExtensionConfig.get('authorization_data');
		if (authorization_data == "-- authorization data was not inserted --"){
			vscode.window.showErrorMessage('Необходимо ввести авторизационные данные в настройках');
			return;
		}
		if (message == " "){
			vscode.window.showWarningMessage('Вы не ввели задачу.');
		}
		const editor = vscode.window.activeTextEditor;
        const currentPosition = editor.selection.active;

		if (Date.now() - time > 1000 * 60 * 29){
			showStatusBarMessage('Authorization...', 10000);
			await getToken(authorization_data).then(token => {
			access_token = token;
			console.log("Token:", access_token);
			if (access_token != undefined){
				time = Date.now();
			}
			clearStatusBar();
		    });
		}

		var lines = await getPreviousLines(currentPosition);
		const initial_prompt = ExtensionConfig.get('initial_prompt');

		showStatusBarMessage('Generating...', 10000);
		let response = await generateResponce(access_token, initial_prompt, message, lines);
		clearStatusBar();
		showStatusBarMessage('Done!', 1000);

		global_response = response;
		line = 1;

	});

	let disposable_print = vscode.commands.registerCommand('vs-code-ai.print_responce', async function () {
		if (global_response == " "){
			vscode.window.showErrorMessage('Сначала нужно сгенерировать ответ');
			return;
		}
		insertContent(global_response);
	});
    
	context.subscriptions.push(disposable_generate, disposable_print ,disposable_setprompt, disposable_settings);
	
}

async function getToken(clientSecret) {
    const url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";

    const headers = {
        "Authorization": "Basic " + clientSecret,
        "RqUID": "c2ff9c6b-7af0-4291-a4c9-c611111221d7",
        "Content-Type": "application/x-www-form-urlencoded"
    };

	const ExtensionConfig = vscode.workspace.getConfiguration('VS Code AI configuration');
	const scope = ExtensionConfig.get('scope');

    const data = {
        "scope": scope
    };

	try {
        const response = await axios.post(url, data, { headers, httpsAgent: { rejectUnauthorized: false } });

        if (response.status === 200) {
            const token = response.data.access_token;
            return token;
        } else {
            console.error(`Error: ${response.status} - ${response.data}`);
        }
    } catch (error) {
        if (error.response) {
            vscode.window.showErrorMessage('Ошибка авторизации: проверьте корректность введенных данных');
        } else {
            vscode.window.showErrorMessage('Ошибка: нет связи с сервером');
        }
    }
}

function showStatusBarMessage(message, timeout) {
	if (!statusBarItem) {
		statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	}
	statusBarItem.text = message;
	statusBarItem.show();
	setTimeout(() => {
		statusBarItem.hide();
	}, timeout);
}
function clearStatusBar() {
	statusBarItem.hide();
}

async function getPreviousLines(cursorPosition) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active text editor.');
        return;
    }

	const ExtensionConfig = vscode.workspace.getConfiguration('VS Code AI configuration');
	const max_lines = ExtensionConfig.get('max_lines');

    const document = editor.document;
    const startLine = Math.max(cursorPosition.line - max_lines, 0);
    const endLine = cursorPosition.line;

    let result = "";
    for (let line = startLine; line <= endLine; line++) {
       result += document.lineAt(line).text + '\n';
    }
	return result;
}

async function generateResponce(token, initial_prompt, prompt, lines){
	const url = "https://gigachat.devices.sberbank.ru/api/v1/chat/completions";
	const headers = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
    };

	const ExtensionConfig = vscode.workspace.getConfiguration('VS Code AI configuration');
	const max_tokens = ExtensionConfig.get('max_tokens');

	const data = {
        "model": "GigaChat:latest",
		"messages": [
			{
				"role": "user",
				"content": initial_prompt
			},
			{
				"role": "user",
				"content": prompt
			},
			{
				"role": "assistant",
				"content": "Конечно, вот ваш код: \n" + lines
			}
		],
		"temperature": 0.7,
		"max_tokens" : max_tokens
    };

	try {
        const response = await axios.post(url, data, { headers, httpsAgent: { rejectUnauthorized: false } });

        if (response.status === 200) {
            const result = response.data.choices[0].message.content;
            return result;
        } else {
            console.error(`Error: ${response.status} - ${response.data}`);
        }
    } catch (error) {
        if (error.response) {
            vscode.window.showErrorMessage('Ошибка авторизации: проверьте корректность введенных данных');
        } else {
            vscode.window.showErrorMessage('Ошибка: нет связи с сервером');
        }
    }
	
}

async function insertContent(response) {
    
	const lines = response.split('\n');
	const nthLine = lines[line - 1] || '\n';
	line+=1;
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		vscode.window.showWarningMessage('No active text editor.');
		return;
	}
	editor.edit(editBuilder => {
		const position = editor.selection.active;
		editBuilder.insert(position, nthLine + '\n');
	});
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
