
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiKey = process.env.ALUU_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'ALUU_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(
      'https://aluu.in/api/v.1/balance',
      {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      }
    );

    const data = await response.json();

    if (!response.ok) {
  return NextResponse.json(
    {
      success: false,
      error: 'ALUU balance check failed',
      status: response.status,
      details: {
        message: data?.message ?? 'No error message returned',
        code: data?.code ?? null,
      },
    },
    { status: 502 }
  );
}

    return NextResponse.json({
      success: true,
      data: data.data ?? null,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Could not connect to ALUU' },
      { status: 502 }
    );
  }
}
