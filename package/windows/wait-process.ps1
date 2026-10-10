param([string]$Exe, [string]$EncodedArguments)
$ErrorActionPreference = 'Stop'
# This shell is disposable. Its own job handle closes when the outer deadline
# kills it, also terminating descendants whose original parent already exited.
# A PID-based taskkill alone cannot find those detached descendants.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class RStudioCheckJob {
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations;
        public ulong ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass,
        ref ExtendedLimits limits, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);

    public static void TrackCurrentShell() {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        var limits = new ExtendedLimits();
        limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (!SetInformationJobObject(job, 9, ref limits,
            (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) {
            int error = Marshal.GetLastWin32Error();
            CloseHandle(job);
            throw new Win32Exception(error);
        }
        using (var process = Process.GetCurrentProcess()) {
            if (!AssignProcessToJobObject(job, process.Handle)) {
                int error = Marshal.GetLastWin32Error();
                CloseHandle(job);
                throw new Win32Exception(error);
            }
        }
        // Keep this private handle open until this child shell exits.
    }
}
'@
[RStudioCheckJob]::TrackCurrentShell()
[string[]]$arguments = ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String($EncodedArguments)))
# Inno uninstallers delegate removal to a temporary child process. Wait for
# that process too, before cleanup can launch it again or remove its directory.
$process = Start-Process -FilePath $Exe -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
