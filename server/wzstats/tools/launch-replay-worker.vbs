Option Explicit

Dim shell, nodePath, workerPath, command
If WScript.Arguments.Count < 2 Then
    WScript.Quit 2
End If

Set shell = CreateObject("WScript.Shell")
nodePath = WScript.Arguments(0)
workerPath = WScript.Arguments(1)
command = """" & nodePath & """ """ & workerPath & """"

WScript.Quit shell.Run(command, 0, True)
