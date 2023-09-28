#!/bin/dash
#mpv "${path}" --start=${time-pos} --profile=nvidia


# Declaring Colors for pretty outputs
normal="\033[0m"
cyan="\033[36m"


# Help section
usage="Usage:
    ## This script is meant to be used with mpv's input.conf ##
    ## Enter the following in your input.conf file           ##
    ${cyan}<keybind> run \"$0\" -f \${file} -t \${=time=pos} -p <profile-name> -i \${pid} ${normal}

    -f        Path of file being played by mpv
    -t        Mpv time-pos property
    -p        Mpv Profile name
    -i        Process id of mpv instance"

# Set arguments
while getopts 'hf:t:p:i:' opt; do
    case "$opt" in 
        h ) printf "$usage" ;;
        f ) file="$OPTARG" ;;
        t ) time="$OPTARG" ;;
        p ) profile="$OPTARG" ;;
        i ) pid="$OPTARG" ;;
    esac
done
[ "$#" = 0 ] && echo "No argument Passed \n" "$usage" && exit


# Run new mpv session and kill previous session
mpv "$file" --start="$time" --profile="$profile" & kill $pid