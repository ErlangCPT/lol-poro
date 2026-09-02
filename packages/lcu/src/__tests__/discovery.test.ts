import { describe, expect, it } from 'vitest';
import {
  installDirectoryFromCommandLine,
  isProcessAlive,
  parseCommandLine,
  parseLockfile,
} from '../discovery';

describe('parseLockfile', () => {
  it('parses name:pid:port:password:protocol', () => {
    expect(parseLockfile('LeagueClient:1234:54321:abc-DEF_123:https\n')).toEqual({
      port: 54321,
      password: 'abc-DEF_123',
      pid: 1234,
      protocol: 'https',
    });
  });
  it('rejects garbage', () => {
    expect(parseLockfile('')).toBeNull();
    expect(parseLockfile('a:b:c')).toBeNull();
  });
});

describe('parseCommandLine', () => {
  it('extracts port and token from the LeagueClientUx command line', () => {
    const cmd =
      '"C:\\Riot Games\\League of Legends\\LeagueClientUx.exe" --riotclient-auth-token=xyz --app-port=61234 --install-directory="C:\\Riot Games\\League of Legends" --remoting-auth-token=q_Wer-tY --region=EUW';
    expect(parseCommandLine(cmd)).toEqual({ port: 61234, password: 'q_Wer-tY', protocol: 'https' });
    expect(installDirectoryFromCommandLine(cmd)).toBe('C:\\Riot Games\\League of Legends');
  });
  it('returns null when incomplete', () => {
    expect(parseCommandLine('LeagueClientUx.exe --app-port=1')).toBeNull();
  });
});

describe('isProcessAlive', () => {
  it('detects the own process and treats unknown pids as alive', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(undefined)).toBe(true);
  });
});
