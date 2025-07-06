#!/usr/bin/env bash

command() {
  case $1 in
    "Lock") swaylock;;
    "Suspend") sudo zzz;;
    "Log Out") niri msg action quit -s;;
    "Reboot") sudo shutdown -r now;;
    "Shutdown") sudo shutdown -P now;;
  esac
}

selection=$(echo -e "Lock\nSuspend\nLog Out\nReboot\nShutdown" | fuzzel --dmenu)
[[ -n $selection ]] && 
[[ $(echo -e "Yes\nNo" | fuzzel --dmenu -p "Do you want to $selection ?") = "Yes" ]] && command $selection

