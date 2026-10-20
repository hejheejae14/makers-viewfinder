import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Redis } from "@upstash/redis";

/**
 * 검색 인덱스와 동기화 진행 상황을 저장하는 곳입니다.
 * 저장소 종류가 바뀌어도 나머지 코드가 그대로이도록 get / set / del 세 가지만 씁니다.
 * - Upstash Redis 환경 변수가 있으면 Redis에 저장합니다. (배포 환경)
 * - 없으면 내 컴퓨터의 임시 폴더에 파일로 저장합니다. (개발 환경 전용)
 */
export interface KvStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

class RedisStore implements KvStore {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get<T>(key: string) {
    return (await this.redis.get<T>(key)) ?? undefined;
  }
  async set(key: string, value: unknown) {
    await this.redis.set(key, value);
  }
  async del(key: string) {
    await this.redis.del(key);
  }
}

class FileStore implements KvStore {
  private dir = path.join(tmpdir(), "viewfinder-index");

  private file(key: string) {
    // 한글 팀 이름이 같은 글자로 바뀌어 서로 덮어쓰지 않도록, 글자를 지우지 않고 인코딩한다.
    return path.join(this.dir, encodeURIComponent(key) + ".json");
  }
  async get<T>(key: string) {
    try {
      return JSON.parse(await readFile(this.file(key), "utf8")) as T;
    } catch {
      return undefined;
    }
  }
  async set(key: string, value: unknown) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(key), JSON.stringify(value));
  }
  async del(key: string) {
    await rm(this.file(key), { force: true });
  }
}

export function getStore(): KvStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new RedisStore(new Redis({ url, token }));

  // 배포 환경에서 Redis 설정을 빠뜨리면 임시 폴더에 저장해 인덱스가 사라지므로, 조용히 넘어가지 않고 멈춘다.
  if (process.env.NODE_ENV === "production") {
    throw new Error("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 환경 변수가 설정되지 않았습니다.");
  }
  return new FileStore();
}
