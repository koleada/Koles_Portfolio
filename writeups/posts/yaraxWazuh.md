---
title: "Yara-X Automated Malware Detection With Wazuh"
date: "2026-04-04"
description: "In this post, I show how to integrate the powerful pattern matching and detection tool Yara-X with Wazuh to falicilate automated, customized malware scanning and quarantining on Linux machines."
tags: ["Wazuh", "Yara-X", "Linux"]
image: "https://raw.githubusercontent.com/koleada/Koles_Portfolio/refs/heads/main/images/yaraxWazuh.jpg"
layout: base.njk
---

# Open Source Anti-Virus Scanning With Yara-X and Wazuh

## Background

[Wazuh](https://wazuh.com/platform/overview/) is an open source SIEM and XDR platform that I am currently super interested in. [Yara](https://github.com/VirusTotal/yara), brought to us by Virus Total is a fully open source pattern matching tools designed to make it easy for malware researchers to write engineer detections for samples.

There are a few great tutorials online for integrating Yara and Wazuh, however, Yara is now just in maintenance mode since it's been replaced by Yara-X. [Yara-X](https://github.com/VirusTotal/yara-x) is a revamped version of Yara, now written in Rust. Since I did not find a write-up regarding the Yara-X, Wazuh integration, I thought who better to do it than myself.

I could go into far greater detail regarding how Yara-X rule creation works, however, the documentation will very likely explain it better than I can. I highly suggest you read [this pariticular area](https://virustotal.github.io/yara-x/docs/writing_rules/anatomy-of-a-rule/) of the documentation and expieriment with detection engineering, it's some cool stuff.

Using these two tools, we can create our own anti-virus scanning that we can tailor to our exact needs, and have the ability to be scanning for the newest malware before our current anti-virus.

I will be showing this installation on a Linux endpoint for now, but I will likely be updating this with a windows implementation as well shortly.

Massive shoutouts to [Neo23x0](https://github.com/Neo23x0), [Mr. SOCFortress aka Taylor Walton](https://socfortress.medium.com/), and all contributors to Wazuh, I greatly appreciate all of your time and effort to allow people like me to work with amazing tooling for free. Taylor hugly inspired me to do this, and much of this is based on his video/blog post showcasing the yara-wazuh integration.

## Install & Initial Setup

I will not cover Wazuh installation here as there are many great resources online that do just that. I personally run Wazuh on docker within my home network. Documentation for installing Wazuh with docker can be found here: [https://documentation.wazuh.com/current/deployment-options/docker/wazuh-container.html](https://documentation.wazuh.com/current/deployment-options/docker/wazuh-container.html)

**Yara-X installation**

On Windows, the easiest way to install Yara-X is simply by grabbing the latest release from the [https://github.com/VirusTotal/yara-x/releases/tag/v1.14.0](https://github.com/VirusTotal/yara-x/releases/tag/v1.14.0) and simply extract it.

On Linux we can install Yara-X by building it ourself. This does require Rust so ensure that is installed prior to running the following:

```bash
git clone https://github.com/VirusTotal/yara-x
cd yara-x
cargo install --path cli
```

On Mac OS we can either build it ourself using the Yara-X repository or install with brew:

```bash
brew install yara-x
```

Once installed ensure it is on PATH, or get into the correct directory and run:

```bash
yr
```

**Rule Set**

Yara-X needs rules to work, these rules come in the form of .yar files that we pass along to Yara-X to run against a specified file. Lucky for us, there is an awesome ruleset we can use made by Neo23x0. We appreciate your work greatly Neo23x0. I'd recommend checking out some other tools made by Neo23x0 such as [Loki](https://github.com/Neo23x0/Loki).

The ruleset repository can be found at: [https://github.com/Neo23x0/signature-base](https://github.com/Neo23x0/signature-base)

To get the rules its as simple as changing to a directory, I chose /var/ossec/yara/rules and cloning the repo:

```bash
cd /var/ossec/yara/rules
git clone https://github.com/Neo23x0/signature-base.git
```

Using these rules with tools Yara-X requires us to remove a couple rules that make use of external varaibles, which we have to remove for them to be used with Yara. Also, since Neo23x0 is updating these rules very often, and we want to be as up to date on our detections as possible, we want to get updates from the repo often.

I built a little script to do just that. You just need to clone the repo, feed it the paths, and add it as a CronJob if youd like to run it on a schedule.

This script also compiles all of the rules. Compiling the rules makes it so we only have to compile a single time instead of doing at runtime each time we want to do a scan.

Script:

```bash
#!/bin/bash

# Simple Script to Update Ruleset and Recompile Rules

git_repo_folder="<PATH_TO_REPO>/signature-base"
out_file="<PATH_TO_COMPILED_RULES>/yaraxCompiledRules.yarac"

cd $git_repo_folder
git pull https://github.com/Neo23x0/signature-base.git

rm -f $git_repo_folder/yara/yara/general_cloaking.yar
rm -f $git_repo_folder/yara/gen_webshells_ext_vars.yar
rm -f $git_repo_folder/yara/thor_inverse_matches.yar
rm -f $git_repo_folder/yara/generic_anomalies.yar
rm -f $git_repo_folder/yara/yara_mixed_ext_vars.yar
rm -f $git_repo_folder/yara/configured_vulns_ext_vars.yar
rm -f $git_repo_folder/yara/gen_fake_amsi_dll.yar
rm -f $git_repo_folder/yara/expl_citrix_netscaler_adc_exploitation_cve_2023_3519.yar
rm -f $git_repo_folder/yara/yara-rules_vuln_drivers_strict_renamed.yar
rm -f $git_repo_folder/yara/gen_mal_3cx_compromise_mar23.yar
rm -f $git_repo_folder/yara/gen_susp_obfuscation.yar
rm -f $git_repo_folder/yara/gen_vcruntime140_dll_sideloading.yar
rm -f $git_repo_folder/yara/expl_connectwise_screenconnect_vuln_feb24.yar

yr compile -o $out_file  $git_repo_folder/yara/

exit 1;
```

Run the crontab command, then enter what follows at the bottom of the file to run the script everyday at 7pm:

```bash
crontab -e

0 19 * * * /var/ossec/yara/rules/yaraxUpdate.sh >> /home/kole/yaraxUpdate.log 2>&1
```

Once that is done, we can test everything is working using Eicar, the Hello World of the anti-virus world.

```bash
wget https://secure.eicar.org/eicar.com

yr scan --output-format json -C yaraxCompiledRules.yarac eicar.com
```

### Wazuh Agent Configuration

Again, I assume you have Wazuh installed and that you have one or more agents ready as well.

**Directory Monitoring**:

We need a way to tell Yara-X what to scan and when to scan it. For this we use the Wazuh File Integrity Monitoring (FIM) features. We can add direcotries to our config, speicifcally within the <syscheck> tags which will tell Wazuh to monitor those. Our agent then generates events when files within those directories are added, modified, deleted, etc.

I chose to monitor the following directories:

```xml
<directories realtime="yes" check_all="yes">/home/</directories>
<directories realtime="yes" check_all="yes">/root/</directories>
<directories realtime="yes" check_all="yes">/usr/local/bin/</directories>
```

Realtime means changes get detected as soon as they happens. So as soon as a file in one of those directories is changed, our Wazuh agent sees it and proceeds to perform the "active response" that we will get to shortly.

My thought process was that I wanted Yara-X to be scanning all binaries I download, which will likely end up in one of the following locations. It can be resource intensive to do these scans on everything so at least for my home network, I wanted to go a bit light. Again the main risk for my home network comes from executables that I download or repositories I clone so those are what I want to be scanning.

The directories I included are obviously nowhere near exhaustive, but for my needs it should be more then sufficient.

Importantly, we can also use <ignore> tags to ignore specific paths, effecitvely excluding them from FIM. This is great for fine tuning exactly what want monitored. An example can be seen below:

```xml
<ignore>/etc/mtab</ignore>
```

**Scan Script:**

Once we have our directories being monitored, we need to give our Wazuh agent the script we want it to run once a file is changed. This of course gets put on our endpoint as our agent will have to perform the actual execution of the script once a FIM event triggers.

Again, as I mentioned earlier, I wanted to target only executables for my scans, by executables I really mean files with the +x permission, or files for interpreeted languages like Python or bash. Anything that I download that I would consider executing should be scanned by yara. This is by no means the most comprehensive checks for executable files, but again it fits my risk current profile. One of the benefits of using something like Wazuh is the endless flexibility it has so I urge you to play around and dial each thing in to your hardwre and threat appetite.

So a quick breakdown of what this script does:

- First we define our fucntion to chcek if something is considered an executable to us
- Next, we define our variables
- I added an if statement to optionally provide a command line argument so I can run it without it being triggered by Wazuh, or otherwise get Wazuh input
- We then log some info and check if the target file is executable
- Next we make sure the file size is static before running the scan, this ensures the file is not in the middle of being downloaded, very important
- Next we check the file size and make sure it is not too large just so we are not wasting resources, again depending on your needs this could be removed
- We then run the actual scan
- If the file gets matched to a rule, we get the .yar rule file that was matched, and take the sha256 hash of the file for use in our analysis and log those two items along with the scan output to our log file
- After that, we quarantine the file by moving it to /tmp/quarantined and making the file immutable with chattr, which is very important for evidence preservation among other things.

**/var/ossec/active-response/bin/yara.sh:**

```bash
#!/bin/bash
# Wazuh - YARA Active Response Script

# We only want to scan executable files
is_executable() {
    local file="$1"

    # Skip directories
    [ -d "$file" ] && return 1

    # +x
    if [ -x "$file" ]; then
        return 0
    fi

    # bang
    if head -n 1 "$file" 2>/dev/null | grep -q '^#!'; then
        return 0
    fi

    # Extra checks for interpreted langs as they can be ran without having +x or bang
    case "$file" in
        *.sh|*.py|*.pl|*.rb|*.js)
            return 0
            ;;
    esac

    # Otherwise, skip
    return 1
}

YARA_BIN="/usr/local/bin/yr"
YARA_RULES_DIR="/var/ossec/yara/rules/yaraxCompiledRules.yarac"
LOG_FILE="/var/ossec/logs/active-responses.log"
QUARANTINE_PATH="/tmp/quarantined"

# For testing purposes allow it to take 1 arg from cli as filename to scan
if [ -n "$1" ]; then
    FILENAME="$1"
else
    read INPUT_JSON
    FILENAME=$(echo "$INPUT_JSON" | jq -r .parameters.alert.syscheck.path)
fi



# echo "$(date) triggered on $FILENAME" >> /tmp/yara-trigger.log

# exit if file is not an executable
if ! is_executable "$FILENAME"; then
  #  echo "Skipping non-executable file: $FILENAME" >> /tmp/yara-trigger.log
    exit 0
fi

# wait until file is no longer growing (eg downloading a file)
size=0
actual_size=$(stat -c %s ${FILENAME})
while [ ${size} -ne ${actual_size} ]; do
    sleep 1
    size=${actual_size}
    actual_size=$(stat -c %s ${FILENAME})
done


# ignore huge files
MAXSIZE=$((100*1024*1024)) # 100MB
if [ -f "$FILENAME" ] && [ $(stat -c %s "$FILENAME") -gt $MAXSIZE ]; then
    echo "Skipping huge file: $FILENAME" >> "$LOG_FILE"
    exit 0
fi

# Run Yara-X scan
YARA_OUTPUT="$("${YARA_BIN}" scan -C "$YARA_RULES_DIR" "$FILENAME")"


if [ -n "$YARA_OUTPUT" ]; then

    # get the name of the matched rule
    RULE_NAME=$(echo "$YARA_OUTPUT" | awk '{print $1}')

    # grab full .yar file that contains the matched rule
    MATCHING_FILE=$(grep -Rn --include="*.yar" "$RULE_NAME" /var/ossec/yara/rules/signature-base/yara/ 2>/dev/null | head -n 1 | awk -F: '{print $1}')


    # grab hash of the file that resulted in match
    FILE_HASH=$(sha256sum "$FILENAME" | awk '{print $1}')

    # append calculated results or original Yara-X output
    YARA_OUTPUT="$YARA_OUTPUT - sha256: $FILE_HASH - match file(s): $MATCHING_FILE"

    echo "wazuh-yara: INFO - Scan result: $YARA_OUTPUT" >> ${LOG_FILE}

    # move to quarantine
    mv -f $FILENAME ${QUARANTINE_PATH}

    # get filename
    FILEBASE=$(/usr/bin/basename $FILENAME)

    # make file immutable
    /usr/bin/chattr -R +i ${QUARANTINE_PATH}/${FILEBASE}

    echo "wazuh-yara: $FILENAME moved to ${QUARANTINE_PATH}" >> ${LOG_FILE}

fi

exit 0
```

Once you have the file, you can confirm its working properly by running:

```bash
wget https://secure.eicar.org/eicar.com
chmod +x eicar.com

./yara.sh eicar.com

cat /var/ossec/log/active-responses.log
```

At the bottom of the log file you should see something like:

```
wazuh-yara: INFO - Scan result: SUSP_Just_EICAR /home/kole/eicar.com - sha256: 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f - match file(s): /var/ossec/yara/rules/signature-base/yara/gen_suspicious_strings.yar
wazuh-yara: /home/kole/eicar.com moved to /tmp/quarantined
```

After, that, we need to create the quarantine directory, and assign proper permissions and ownership to yara.sh

```bash
mkdir /tmp/quarantined
chown root:wazuh /var/ossec/active-response/bin/yara.sh
chmod 750 /var/ossec/active-response/bin/yara.sh
```

### Wazuh Manager Configuration

We need to do a couple of things in the Wazuh Manager itself to enable proper ingestion of our new logs. Specifcally, we need to add a decoder and a new rule to our manager.

To learn more about why we have to do this and what decoders and rules are in wazuh, I highly suggest reading this article: [https://simplico.net/2026/03/10/wazuh-decoders-rules-the-missing-mental-model/](https://simplico.net/2026/03/10/wazuh-decoders-rules-the-missing-mental-model/).

In short, decoders take our raw logs and convert them into a structured format, like key,value pairs. Rules evaluate a log or decoded fields depending on if the decoder was ran or not and decide if an alert should be generated as a result, and what sevirity alert to generate.

**Rule:**

Begin by logging into the Wazuh web UI and going to Server Management > Rules.

Select "Add new rules file"

Name is somthing like yara-rules.xml and add the following:

```xml
<group name="yara,">
    <rule id="200100" level="1">
        <decoded_as>yara</decoded_as>
        <description>YARA rules grouped.</description>
    </rule>

    <rule id="200101" level="12">
        <if_sid>200100</if_sid>
        <match>wazuh-yara: INFO - Scan result: </match>
        <mitre>
           <id>T1204</id>
        </mitre>
        <description>YARA $(yara_rule) detected.</description>
    </rule>
</group>
```

**Decoder:**

Again in the Wazuh web UI go to Server Management but this time, select Decoders, Add new decoders file, and name it something like yara.xml.

Within that file we want to add the following:

```xml
<decoder name="yara">
  <prematch>wazuh-yara:</prematch>
</decoder>

<!--wazuh-yara: INFO - Scan result: SUSP_Just_EICAR /home/kole/eicar.com - sha256: 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f - match file(s): /var/ossec/yara/rules/signature-base/yara/gen_suspicious_strings.yar -->


<decoder name="yara_decoder1">
  <parent>yara</parent>
  <regex>wazuh-yara: (\S+) - Scan result: (\S+) [description\p\p(\.*)"\.*] (\S+)</regex>
  <order>log_type, yara_rule, yara_description, yara_scanned_file</order>
</decoder>
```

**Active Response:**

The last thing we must do is add to our server ossec.conf file, to basically tell it how to instruct our agents to begin the scan.

Go to the bottom of the file, and add the following:

```xml
<ossec_config>
  <command>
    <name>yara_linux</name>
    <executable>yara.sh</executable>
    <timeout_allowed>no</timeout_allowed>
  </command>

  <active-response>
    <disabled>no</disabled>
    <command>yara_linux</command>
    <location>local</location>
    <rules_group>syscheck</rules_group>
  </active-response>
</ossec_config>
```

You should have a second set of <ossec_config> tags already at the bottom of the file, in which case just add what is between those tags in the above code block.

This includes the filename for the yara_linux command, which tells our agent how to run said command.

### Testing

Now that we have the setup done, we want to confirm this is working properly.

In your /home directory run:

```bash
wget https://secure.eicar.org/eicar.com
chmod +x eicar.com
```

Then, jump into your Wazuh web interface and go to discover.

Just below the search bar, press add filter, for field, enter rule.groups, for operator hit 'is', then for value enter 'yara'

You should see at least one result there. If you do expand it, and you should see fields like full log, with a similar log to the one I showed earlier.

If you do you sucessfully configured yara active response scanning!
