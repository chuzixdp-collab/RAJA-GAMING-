import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { playerId, productId } = await req.json();

    if (!playerId || !productId) {
      return NextResponse.json(
        { error: 'Player ID aur Product ID zaroori hain' },
        { status: 400 }
      );
    }

    const response = await fetch('https://b2b.foxreload.com/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.FOXRELOAD_API_KEY || '',
      },
      body: JSON.stringify({
        product_id: productId,
        player_id: playerId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || 'Order process nahi ho saka' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Order successful!',
      data: data,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}
