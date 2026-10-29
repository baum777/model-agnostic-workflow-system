# Input: orders-api v2 (OpenAPI fragment)

Source: `cases/api-contract-review/pos-standard/openapi-fragment.md` (fixture, self-contained)

```yaml
openapi: 3.1.0
info:
  title: orders-api
  version: 2.0.0
servers:
  - url: /v2
paths:
  /orders:
    get:
      operationId: listOrders
      summary: List orders for the calling tenant
      parameters:
        - {name: limit, in: query, schema: {type: integer, default: 50, maximum: 200}}
        - {name: cursor, in: query, schema: {type: string}}
      responses:
        "200":
          description: Order page
          content:
            application/json:
              schema: {$ref: "#/components/schemas/OrderPage"}
        "401": {$ref: "#/components/responses/Unauthorized"}
        "403": {$ref: "#/components/responses/Forbidden"}
        "429": {$ref: "#/components/responses/RateLimited"}
    post:
      operationId: createOrder
      summary: Create an order (idempotent per client request)
      requestBody:
        content:
          application/json:
            schema: {$ref: "#/components/schemas/OrderCreate"}
      responses:
        "201": {description: Created}
        "409": {description: Duplicate idempotency key}
        "401": {$ref: "#/components/responses/Unauthorized"}
        "403": {$ref: "#/components/responses/Forbidden"}
        "429": {$ref: "#/components/responses/RateLimited"}
  /orders/{orderId}:
    delete:
      operationId: deleteOrder
      parameters: [{name: orderId, in: path, required: true, schema: {type: string}}]
      responses:
        "204": {description: Deleted}
        "404": {description: Not found}
        "401": {$ref: "#/components/responses/Unauthorized"}
components:
  responses:
    Unauthorized: {description: Missing or invalid credentials}
    Forbidden: {description: Authenticated but not permitted for this tenant}
    RateLimited: {description: Retry after the indicated delay}
  schemas:
    OrderPage:
      type: object
      properties:
        items: {type: array, items: {$ref: "#/components/schemas/Order"}}
        nextCursor: {type: string}
    Order:
      type: object
      properties:
        id: {type: string}
        total: {type: number}
    OrderCreate:
      type: object
      required: [items]
      properties:
        items:
          type: array
          items: {type: string}
        idempotencyKey: {type: string}
```

Change context: migration from v1 (operationId `orders.list` renamed to `listOrders`;
`DELETE /orders/{orderId}` newly scoped to the owning tenant).
