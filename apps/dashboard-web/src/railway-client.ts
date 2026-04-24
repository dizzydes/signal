const ENDPOINT = "https://backboard.railway.com/graphql/v2";

function token(): string {
  const t = process.env.RAILWAY_API_TOKEN;
  if (!t) throw new Error("RAILWAY_API_TOKEN is not set");
  return t;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token()}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || body.errors) {
    throw new Error(`Railway GQL: ${body.errors?.map((e) => e.message).join(", ") ?? res.statusText}`);
  }
  return body.data as T;
}

export async function setServiceVariable(input: {
  projectId: string;
  environmentId: string;
  serviceId: string;
  name: string;
  value: string;
}): Promise<void> {
  await gql(
    `mutation SetVar($input: VariableUpsertInput!) {
       variableUpsert(input: $input)
     }`,
    { input }
  );
}
