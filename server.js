var _ = require('underscore'),
  cache = require('memory-cache'),
  compression = require('compression'),
  express = require('express'),
  geobuf = require('geobuf'),
  Pbf = require('pbf'),request = require('request'),
  pd = require('pretty-data').pd,
  url = require('url');

function before(req, res, next) {
  res.setHeader('Access-Control-Allow-Headers', 'Content-Length, Content-Type, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
  } else {
    next();
  }
}
function respond(res, data, callback) {
  if (typeof callback === 'string') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(callback + '(' + JSON.stringify(data) + ');');
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  }
}

express()
  .use(before)
  .use(compression())
  .get('/', function(req, res) {
    var params = url.parse(req.url, true).query,
      apiCallback = params.callback,
      apiEncoded = params.encoded,
      apiType = params.type,
      apiUrl = params.url;

    if (!apiType) {
      respond(res, {
        error: 'The "type" parameter is required.',
        success: false
      }, apiCallback);
    } else if (!apiUrl) {
      respond(res, {
        error: 'The "url" parameter is required.',
        success: false
      }, apiCallback);
    } else {
      var cached = null;

      if (apiEncoded) {
        apiUrl = new Buffer(apiUrl, 'base64');
      }

      apiUrl = decodeURIComponent(apiUrl);
      cached = cache.get(apiUrl);

      if (cached) {
        cache.put(apiUrl, cached, 120000);
        respond(res, {
          data: cached,
          success: true
        }, apiCallback);
      } else {
        var externalReqHeaders = _.omit(req.headers, 'accept-encoding', 'connection', 'cookie', 'host', 'user-agent');

        request({
          encoding: 'utf8',
          headers: externalReqHeaders,
          strictSSL: false,
          uri: apiUrl
        }, function(error, response, body) {
          if (error) {
            respond(res, {
              error: error,
              success: false
            }, apiCallback);
          } else {
            if (response.statusCode === 200) {
              var msg = null,
                text = null;

              switch (apiType) {
              case 'json':
                console.log('json');
                try {
                  text = JSON.parse(body);
                } catch(e) {
                  msg = 'The requested JSON was malformed.';
                }

                break;
              case 'geobuf':
                console.log('geobuf');
                try {
                  // This seems to be slower (but smaller): .toString('utf8')
                  text = geobuf.encode(JSON.parse(body), new Pbf());
                } catch(e) {
                  msg = 'The requested GeoJSON or TopoJSON was malformed.';
                }
                break;
              case 'text':
                text = body;
                break;
              case 'xml':
                text = pd.xmlmin(body);
                break;
              }

              if (msg) {
                respond(res, {
                  error: msg,
                  success: false
                }, apiCallback);
              } else if (text) {
                cache.put(apiUrl, text, 120000);
                respond(res, {
                  data: text,
                  success: true
                }, apiCallback);
              } else {
                respond(res, {
                  error: 'No data returned.',
                  success: false
                }, apiCallback);
              }
            } else {
              respond(res, {
                error: 'The server responded with a non-2xx status code: ' + response.statusCode + '.',
                success: false
              }, apiCallback);
            }
          }
        });
      }
    }
  })
  .listen(process.env.PORT || 8000);
