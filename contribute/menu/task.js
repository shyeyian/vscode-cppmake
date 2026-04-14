// @ts-check

const vscode = require('vscode')

/** @type {vscode.Task | undefined} */
let currentSelectedTask // TODO: this is undefined if and only if none tasks is selecable (e.g. all tasks.json in workspace are empty). Should we use a new UI?

const startTaskCommand = vscode.commands.registerCommand('startTask', async () => {
    if (currentSelectedTask != undefined)
        vscode.tasks.executeTask(currentSelectedTask)
})

const selectTaskCommand = vscode.commands.registerCommand('selectTask', async () => {
    const jsonTasks      = (await vscode.tasks.fetchTasks()).filter(task => task.source == 'Workspace')
    const splitLine      = new vscode.Task({type: ''}, vscode.TaskScope.Global, '----------', 'Cppmake')
    const extensionTasks = (await vscode.tasks.fetchTasks()).filter(task => task.source != 'Workspace')
    const tasks          = jsonTasks.concat(splitLine, ...extensionTasks)
    const selectedTaskName = await vscode.window.showQuickPick(
        tasks.map(task => task.definition.label != undefined ? task.definition.label : task.name), 
       // {canPickMany: false}
    )
    for (const task of tasks)
        if (task.name == selectedTaskName)
            currentSelectedTask = task
})

const openTasksJsonCommand = vscode.commands.registerCommand('openTasksJson', async () => {
    if (currentSelectedTask        != undefined &&
        currentSelectedTask.source == 'Workspace' && 
        currentSelectedTask.scope  != undefined && 
        typeof currentSelectedTask.scope != 'number')
        vscode.window.showTextDocument(vscode.Uri.joinPath(currentSelectedTask.scope.uri, '.vscode', 'tasks.json'))
})

/** 
 * @param {vscode.ExtensionContext} context 
 * @returns {Promise<void>} 
 */
async function activate(context) {
    currentSelectedTask = (await vscode.tasks.fetchTasks()).length >= 1 ? (await vscode.tasks.fetchTasks())[0] : undefined
    context.subscriptions.push(selectTaskCommand)
    context.subscriptions.push(openTasksJsonCommand)
}

module.exports = {activate}
