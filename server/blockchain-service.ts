import { ethers } from "ethers";
import { db } from "./db";
import { cryptoSends } from "@shared/schema";
import { eq } from "drizzle-orm";

const BSC_RPC_ENDPOINTS = [
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  "https://bsc-dataseed1.ninicoin.io/",
];

const BSC_CHAIN_ID = 56n;
const USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18;
const GAS_LIMIT = 100000n;
const GAS_PRICE_GWEI = "3";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

let sendMutex = false;

function getPrivateKey(): string {
  const key = process.env.TRUST_WALLET_PRIVATE_KEY;
  if (!key) throw new Error("TRUST_WALLET_PRIVATE_KEY secret not configured");
  return key.startsWith("0x") ? key : `0x${key}`;
}

function createProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(BSC_RPC_ENDPOINTS[0], {
    chainId: Number(BSC_CHAIN_ID),
    name: "bsc",
  });
}

async function verifyChainId(provider: ethers.JsonRpcProvider): Promise<void> {
  const network = await provider.getNetwork();
  if (network.chainId !== BSC_CHAIN_ID) {
    throw new Error(`Wrong chain! Expected BSC (56), got ${network.chainId}`);
  }
}

export async function getWalletInfo(): Promise<{
  address: string;
  usdtBalance: string;
  bnbBalance: string;
  configured: boolean;
}> {
  try {
    const privateKey = getPrivateKey();
    const provider = createProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    await verifyChainId(provider);

    const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, provider);
    const [usdtRaw, bnbRaw] = await Promise.all([
      usdtContract.balanceOf(wallet.address),
      provider.getBalance(wallet.address),
    ]);

    return {
      address: wallet.address,
      usdtBalance: ethers.formatUnits(usdtRaw, USDT_DECIMALS),
      bnbBalance: ethers.formatEther(bnbRaw),
      configured: true,
    };
  } catch (e: any) {
    if (e.message.includes("TRUST_WALLET_PRIVATE_KEY")) {
      return { address: "", usdtBalance: "0", bnbBalance: "0", configured: false };
    }
    throw e;
  }
}

export function validateAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export function checksumAddress(address: string): string {
  return ethers.getAddress(address);
}

export interface SendUSDTResult {
  txHash: string;
  blockNumber: number;
  gasUsed: string;
  gasCostBnb: string;
}

export async function sendUSDT(
  recipientAddress: string,
  amount: string,
  idempotencyKey: string,
): Promise<SendUSDTResult> {
  if (!validateAddress(recipientAddress)) {
    throw new Error(`Invalid recipient address: ${recipientAddress}`);
  }

  const checksumRecipient = checksumAddress(recipientAddress);

  const existing = await db
    .select()
    .from(cryptoSends)
    .where(eq(cryptoSends.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing.length > 0 && existing[0].txHash) {
    console.log(`[Blockchain] Idempotency hit: ${idempotencyKey} → ${existing[0].txHash}`);
    return {
      txHash: existing[0].txHash!,
      blockNumber: existing[0].blockNumber ?? 0,
      gasUsed: existing[0].gasUsed ?? "0",
      gasCostBnb: existing[0].gasCostBnb ?? "0",
    };
  }

  if (sendMutex) {
    throw new Error("Another send is in progress. Please wait and try again.");
  }

  sendMutex = true;
  try {
    const privateKey = getPrivateKey();
    const provider = createProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    await verifyChainId(provider);

    const usdtContract = new ethers.Contract(USDT_CONTRACT, ERC20_ABI, wallet);

    const parsedAmount = ethers.parseUnits(amount, USDT_DECIMALS);
    if (parsedAmount <= 0n) {
      throw new Error("Amount must be greater than zero");
    }

    const [usdtBalance, bnbBalance] = await Promise.all([
      usdtContract.balanceOf(wallet.address) as Promise<bigint>,
      provider.getBalance(wallet.address),
    ]);

    if (usdtBalance < parsedAmount) {
      throw new Error(
        `Insufficient USDT balance. Have: ${ethers.formatUnits(usdtBalance, USDT_DECIMALS)}, Need: ${amount}`
      );
    }

    const estimatedGasCost = GAS_LIMIT * ethers.parseUnits(GAS_PRICE_GWEI, "gwei");
    if (bnbBalance < estimatedGasCost) {
      throw new Error(
        `Insufficient BNB for gas. Have: ${ethers.formatEther(bnbBalance)}, Need: ~${ethers.formatEther(estimatedGasCost)}`
      );
    }

    if (checksumRecipient.toLowerCase() === wallet.address.toLowerCase()) {
      throw new Error("Cannot send to the same wallet address");
    }

    const nonce = await provider.getTransactionCount(wallet.address, "pending");

    console.log(`[Blockchain] Sending ${amount} USDT to ${checksumRecipient} (nonce: ${nonce}, key: ${idempotencyKey})`);

    const tx = await usdtContract.transfer(checksumRecipient, parsedAmount, {
      gasLimit: GAS_LIMIT,
      gasPrice: ethers.parseUnits(GAS_PRICE_GWEI, "gwei"),
      nonce,
    });

    console.log(`[Blockchain] TX broadcast: ${tx.hash}`);

    await db
      .update(cryptoSends)
      .set({ status: "broadcasting", txHash: tx.hash, updatedAt: new Date() })
      .where(eq(cryptoSends.idempotencyKey, idempotencyKey));

    const receipt = await tx.wait(3);

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Transaction reverted: ${tx.hash}`);
    }

    console.log(`[Blockchain] TX confirmed: ${tx.hash} in block ${receipt.blockNumber}`);

    const gasCostWei = receipt.gasUsed * receipt.gasPrice;

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      gasCostBnb: ethers.formatEther(gasCostWei),
    };
  } finally {
    sendMutex = false;
  }
}
