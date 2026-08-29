type JsonSchema = Record<string, unknown>;

function hasOwn(schema: JsonSchema, key: string) {
  return Object.prototype.hasOwnProperty.call(schema, key);
}

function firstDefined(schema: JsonSchema, keys: string[]): unknown {
  for (const key of keys) {
    if (hasOwn(schema, key)) return schema[key];
  }
  return undefined;
}

function stringExample(name: string, schema: JsonSchema) {
  const format = typeof schema.format === 'string' ? schema.format : '';
  const context = `${name} ${typeof schema.title === 'string' ? schema.title : ''} ${
    typeof schema.description === 'string' ? schema.description : ''
  }`.toLowerCase();

  if (format === 'email' || /(^|[_\s-])e-?mail|邮箱|邮件地址/.test(context)) {
    return 'user@example.com';
  }
  if (format === 'uri' || format === 'url' || /url|uri|链接|网址/.test(context)) {
    return 'https://example.com';
  }
  if (format === 'date-time' || /date.?time|日期时间|时间戳/.test(context)) {
    return '2026-08-25T12:00:00Z';
  }
  if (format === 'date' || /(^|[_\s-])date|日期/.test(context)) return '2026-08-25';
  if (format === 'time' || /(^|[_\s-])time|时间/.test(context)) return '12:00:00';
  if (format === 'uuid' || /uuid/.test(context)) return '550e8400-e29b-41d4-a716-446655440000';
  if (/phone|mobile|tel|手机号|电话/.test(context)) return '13800138000';
  if (/order.?id|订单号|订单id/.test(context)) return '123456';
  if (/user.?id|用户id/.test(context)) return 'user_123';
  if (/(^|[_\s-])id|编号|标识/.test(context)) return `${name || 'item'}_123`;
  if (/city|城市/.test(context)) return '北京';
  if (/address|地址/.test(context)) return '北京市朝阳区示例路 1 号';
  if (/name|名称|姓名/.test(context)) return '示例名称';
  if (/query|keyword|搜索|关键词/.test(context)) return '示例查询';
  return typeof schema.description === 'string' && schema.description.trim()
    ? schema.description.trim()
    : '示例文本';
}

function mergeObjectExamples(schemas: unknown[], name: string) {
  return schemas.reduce<Record<string, unknown>>((result, item) => {
    const value = buildJsonSchemaExample(item, name);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...result, ...value }
      : result;
  }, {});
}

/** 根据常见 JSON Schema 字段生成一份可直接编辑和发送的样例值。 */
export function buildJsonSchemaExample(schemaValue: unknown, name = ''): unknown {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) return {};
  const schema = schemaValue as JsonSchema;

  const explicit = firstDefined(schema, ['example', 'default', 'const']);
  if (explicit !== undefined) return explicit;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  if (Array.isArray(schema.allOf)) return mergeObjectExamples(schema.allOf, name);
  for (const alternative of ['oneOf', 'anyOf']) {
    const choices = schema[alternative];
    if (Array.isArray(choices) && choices.length > 0) {
      return buildJsonSchemaExample(choices[0], name);
    }
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = types.find((item) => item !== 'null');
  const properties = schema.properties;

  if (type === 'object' || (properties && typeof properties === 'object')) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
    return Object.fromEntries(
      Object.entries(properties).map(([propertyName, propertySchema]) => [
        propertyName,
        buildJsonSchemaExample(propertySchema, propertyName),
      ]),
    );
  }
  if (type === 'array') return [buildJsonSchemaExample(schema.items, name)];
  if (type === 'integer' || type === 'number') {
    const minimum = firstDefined(schema, ['minimum', 'exclusiveMinimum']);
    return typeof minimum === 'number' ? minimum : type === 'integer' ? 1 : 1.5;
  }
  if (type === 'boolean') return true;
  if (type === 'null') return null;
  // Tool parameters 的根 schema 为空时应生成对象；无类型的属性仍按字符串描述推断。
  if (!name && type === undefined) return {};
  return stringExample(name, schema);
}

export function formatJsonSchemaExample(schema: unknown) {
  return JSON.stringify(buildJsonSchemaExample(schema), null, 2);
}
