const PROJECT_REF = "rhdcobxxezxwesksnbrt";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const BUCKET = "kyc-documents";

let _serviceRoleKey: string | null = null;

async function getServiceRoleKey(): Promise<string> {
  if (_serviceRoleKey) return _serviceRoleKey;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN not set");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch API keys: ${res.status}`);
  const keys = await res.json();
  const srk = keys.find((k: any) => k.name === "service_role");
  if (!srk?.api_key) throw new Error("Service role key not found");
  _serviceRoleKey = srk.api_key;
  return _serviceRoleKey!;
}

function headers(key: string, contentType?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
  if (contentType) h["Content-Type"] = contentType;
  return h;
}

export async function uploadKycDocument(
  customerId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ path: string; fullPath: string }> {
  const key = await getServiceRoleKey();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ts = Date.now();
  const storagePath = `${customerId}/${ts}_${safeName}`;

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        ...headers(key, mimeType),
        "x-upsert": "true",
      },
      body: fileBuffer,
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${body}`);
  }

  return { path: storagePath, fullPath: `${BUCKET}/${storagePath}` };
}

export async function getSignedUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<string> {
  const key = await getServiceRoleKey();
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: headers(key, "application/json"),
      body: JSON.stringify({ expiresIn }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Signed URL failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return `${SUPABASE_URL}/storage/v1${data.signedURL}`;
}

export async function deleteKycDocument(storagePath: string): Promise<void> {
  const key = await getServiceRoleKey();
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}`,
    {
      method: "DELETE",
      headers: headers(key, "application/json"),
      body: JSON.stringify({ prefixes: [storagePath] }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`Storage delete failed (${res.status}): ${body}`);
  }
}
