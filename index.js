import http from 'http';

const PORT = process.env.PORT || 7777;

const STORE = {
  todo: [{ id: 1, title: 'Title', description: 'Description', done: false }],
  todoInterator: 1,
  user: []
}

const sendErrorMessage = (message, code = 500) => (req, res) => {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end(JSON.stringify({
    method: req.method,
    url: req.url,
    code,
    message
  }))
};

const sendNotFoundMethodError = sendErrorMessage('Method not found', 404);
const sendTodoIsNotExistsError = sendErrorMessage('Todo is not exists', 404)
const sendInternalServerError = sendErrorMessage('Internal Server Error', 500);

function resolvePath(req, res, routing) {

  function resolveSlugs(template, path) {
    const templateParts = template.split('/');
    const pathParts = path.split('/');

    if (templateParts.length !== pathParts.length) {
      throw new Error('Template and path do not match');
    }

    const resolvedSlugs = {};

    for (let i = 0; i < templateParts.length; i++) {
      const templatePart = templateParts[i];
      const pathPart = pathParts[i];

      if (templatePart.startsWith(':')) {
        const slugName = templatePart.substring(1);
        resolvedSlugs[slugName] = pathPart;
      }
    }

    return resolvedSlugs;
  }

  for (const template in routing) {
    const route = routing[template].find(r => r.method === req.method);
    if (route && route.method === req.method) {
      try {
        req.params = resolveSlugs(template, req.url);
        try {
          route.callback(req, res)
        } catch {
          sendInternalServerError(req, res)
        }
        return;
      } catch (error) { }
    }
  }

  sendNotFoundMethodError(req, res);
}

const routing = {
  '/todo': [
    {
      method: 'GET',
      callback: async (_req, res) => {
        res.sendJSON({
          list: STORE.todo
        })
      }
    },
    {
      method: 'POST',
      callback: async (req, res) => {
        const { title, description } = await req.parseBody()
        if (!title) {
          sendErrorMessage(JSON.stringify({
            title: 'required field'
          }), 403)(req, res)
          return
        }
        const todo = { id: ++STORE.todoInterator, title, description: description || '', done: false };
        STORE.todo.push(todo);
        res.sendJSON(todo)
      }
    }

  ],
  '/todo/:id': [{
    method: 'GET',
    callback: async (req, res) => {
      const todo = STORE.todo.find(t => t.id === +req.params.id);
      if (!todo) {
        sendTodoIsNotExistsError(req, res);
        return
      }
      res.sendJSON(todo);
    }
  },
  {

    method: 'PATCH',
    callback: async (req, res) => {
      const todo = STORE.todo.find(t => t.id === +req.params.id);
      if (!todo) {
        sendTodoIsNotExistsError(req, res);
        return
      }

      const { title, description, done } = await req.parseBody();
      todo.title = title ?? todo.title
      todo.description = description ?? todo.description
      todo.done = done ?? todo.done
      res.sendJSON(todo)
    }
  },
  {
    method: 'DELETE',
    callback: async (req, res) => {
      const countElements = STORE.todo.length;

      STORE.todo = STORE.todo.filter(t => t.id !== +req.params.id);
      res.sendJSON({ deleted: countElements - STORE.todo.length });
    }
  }
  ],
}

const sendJSON = function(payload, code = 200) {
  this.writeHead(code, { "Content-Type": "application/json" });
  this.end(
    JSON.stringify(payload)
  );
}

const parseBody = async function() {
  let body = '';
  this.on('data', data => {
    body += data;
  })
  return await new Promise((resolve, reject) => {
    this.once('error', error => reject(error))
    this.once('end', () => resolve(JSON.parse(body)))
  })
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  res.sendJSON = sendJSON;
  req.parseBody = parseBody;
  resolvePath(req, res, routing)
})

server.listen(PORT, () => console.log(`Server is listening on port ${PORT}`))
  .on("error", function(_err) {
    process.once("SIGUSR2", function() {
      process.kill(process.pid, "SIGUSR2");
    });
    process.on("SIGINT", function() {
      process.kill(process.pid, "SIGINT");
    });
  });
