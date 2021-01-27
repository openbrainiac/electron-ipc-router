const { ipcMain, ipcRenderer } = require('electron')
const http = require('http');

function subscriber(routes, port){
    if(!routes || typeof routes !== 'object') throw new Error("invalid argument for subscriber, expected Object");
    Object.entries(routes).forEach(elem => {
        let route = elem[0];
        let callback = elem[1];
        if (!route || !callback || typeof callback !== 'function') return;
        ipcMain.on(route, (event, ...args) => {
            let result
            try {
                result = callback(...args);
            }
            catch (err){
                console.error(err)
                event.reply(`${route}-error`, err)
            }
            if(!(result instanceof Promise)) event.reply(`${route}-response`, result)

            else result
                    .then(response => {
                        event.reply(`${route}-response`, response);
                    })
                    .catch(e => {
                        console.error(e);
                        event.reply(`${route}-error`, e);
                    });

        });
    });
    if(port) server(routes, port);
}

function ipc(route, ...args) {
     return new Promise(((resolve, reject) => {
         ipcRenderer.once(`${route}-response`, (event, response) => {
             ipcRenderer.removeAllListeners(`${route}-error`);
            resolve(response);
        });

         ipcRenderer.once(`${route}-error`, (event, error) => {
             ipcRenderer.removeAllListeners(`${route}-response`);
            reject(error);
        });

         ipcRenderer.send(route, ...args);
    }))
}

function server(routes, port){
    http.createServer((request, response) => {
        const { headers, method, url } = request;
        if(method !== "POST") return sendError(response, "method must be POST");
        const funcName = url.substring(1)
        const cb = routes[funcName]

        if(!cb || typeof cb !== 'function') return sendError(response, "function does not exist");


        let body = [];
        request
            .on('error', (err) => {
                console.error(err);
            })

            .on('data', (chunk) => body.push(chunk))

            .on('end', () => {
                if(!body.length) return sendError(response, "body is required");
                body = Buffer.concat(body).toString();
                let args = JSON.parse(body).args
                if(!args) return sendError(response, "args are missing from the body");
                if(!Array.isArray(args)) return  sendError(response, "args must be an array");

                let result
                try { result = cb(...args)}
                catch (err){
                    console.error(err)
                    sendError(response, JSON.stringify(err, Object.getOwnPropertyNames(err)))
                    return
                }

                if(!(result instanceof Promise)) sendSuccess(response, result)

                else result
                    .then(res => {
                        sendSuccess(response, res)
                    })
                    .catch(e => {
                        sendError(response, JSON.stringify(e, Object.getOwnPropertyNames(e)))
                    });
            });
    })
      .listen(port,function() {
          console.log('\x1b[32m%s\x1b[0m', 'electron-ipc-router server running on port ' + port);
      })
      .on('error', console.log);
}

function sendError(response, text){
    response.writeHead(404, {'Content-Type': 'text/plain'});
    response.end(text);
}

function sendSuccess(response, result){
    response.writeHead(200, {'Content-Type': 'application/json'});
    response.end(JSON.stringify({
        response: result
    }));
}

module.exports = {
    subscriber,
    ipc
}