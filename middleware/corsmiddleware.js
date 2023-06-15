// Custom middleware to set Access-Control-Allow-Origin dynamically based on the request origin
function setCorsHeaders(handler) {
    return function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', "*");
        res.setHeader('Access-Control-Allow-Credentials', true);
        handler(req, res, next);
    };
}

module.exports = setCorsHeaders;