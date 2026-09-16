/**
 * Validate req[source] against a zod schema and replace it with the parsed value.
 */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    if (source === 'query') {
      // req.query is a getter-only object on Express 5-style setups; merge instead.
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data;
    }
    return next();
  };
