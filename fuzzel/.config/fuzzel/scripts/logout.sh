#!/usr/bin/env bash

SELECTION=$( echo -e "Lock\nSuspend\nLogout\nReboot\nShutdown" |
  fuzzel --dmenu --minimal-lines --hide-prompt \
    --border-width=4 --border-radius=0 --horizontal-pad=10 \
    --border-color="e64940ff"          \
    --background="1d1f21ff"            \
    --match-color="c55555ff"           \
    --selection-color="2e2e2bff"       \
    --selection-match-color="c55555ff" )

case $SELECTION in
  "Lock")      swaylock;;
  "Suspend")   swaylock -f; loginctl suspend;;
  "Logout")    niri msg action quit -s;;
  "Reboot")    loginctl reboot;;
  "Shutdown")  loginctl poweroff;;
esac
