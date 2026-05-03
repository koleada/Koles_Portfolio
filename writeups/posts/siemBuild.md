---
title: "Building An Enterprise-Grade, Open Source SIEM With 1 Command (almost)"

date: "2026-04-25"

description: "In this post, I will show you how to create an enterprise grade Security Information and Event Management system with one command. Our SIEM is fully open source and infinitly customizeable."

tags: ["Wazuh", "SOCFortress CoPilot", "Graylog", "SIEM"]

image: "https://raw.githubusercontent.com/koleada/Koles_Portfolio/refs/heads/main/images/SIEM.jpg"

layout: base.njk
---

# Building An Enterprise-Grade, Open Source SIEM With 1 Command (almost)

### Objectives of This Post

By the end of this post, you will be have all of your SIEM architecture setup securely (I hope) and can begin to configure and tailor it to your exact needs. We will go over basic configuration in this post but much of the deeper concepts will be covered in later posts. There is so much that can be done in this stack, this is just the absolute beginning.

In this particular post we will focus on setting up:

- [Wazuh](https://github.com/wazuh/wazuh)
- [Graylog](https://github.com/Graylog2)
- [SOCFortress CoPilot](https://github.com/socfortress/CoPilot)

We will be talking a tiny bit about [Grafana](https://github.com/grafana/grafana) too.

I mentioned enterprise grade, and I do mean that somewhat seriouesly. Granted an enterprise would likely want multiple graylog/wazuh nodes, redundant log storage, and other high availability architecture designs, whcih I will not be discussing here. When I say enterprise grade I mean securely configured, running HTTPS, using strong passwords, etc. Enterprise grade also means functionality. To be blunt, I do not have epxierence with many other SIEM architectures, but I would be surprised if I found something I liked more then this. The customization is endless, you can quite literally adjust this stack to handle anything and everything, which from what I've seen elsehwere is simply not possible.

### Requirements

Before you continue with doing this setup for yourself, make sure your machine that will be hosting this has AVX. This is a requirement for the mongo DB version that we need. So again before proceeding ensure AVX on your machine is set up.

This writeup is also geared toward linux machines so keep that it mind. I would also recommend installing gedit if at all possible. Or if your like me and used a headless ubuntu server, you'll want sublime text with the SFTP package installed to make all of the text editing much easier.

Just an immeidate heads up, if you try to do this in WSL your appraoch will have to be different. If you want to try it anyways, in the Wazuh cert.yml file, change the IP to just be wazuh.indexer, wazuh.manager, and wazuh.dashboard, then use that as the URL in Graylog, eg admin:SecretPassword@wazuh.indexer:9200. This should work, but you will still have issues if you want to access the Wazuh server from other machines on the network. The only option is to use firewall rules and port forwarding on the host itself.

The best option for hardware in my opinion is probably proxmox, or just a physcial linux install on metal. You can use Hyper-V too so long as your host machine has an AVX compatible CPU.

### Why Do We Need A Setup Blog Post? Can't We Just Run These With Docker?

Yes, you can run these with docker, and that is exactly what we will be doing here, but trust me this article does provide value.

I spent and exorbatant amount of time trying to get this architecture up and running properly, hitting problems at almost every turn. There are posts to setup Wazuh, Grafana, and Graylog on their own sure, and there are posts regarding setting up SOCFortress CoPilot too. However, we need to integrate all of these technologies together in a very specific way, if one version is off you will encounter extremely annoying issues.

Articles simply do not exist for building a full SIEM using all of these technolgies so who better than I, after spending days getting it all right, to write one.

### Background Information

SIEM: Security Information and Event Management

A SIEM is essentially an aggregaator of all logs in our envionrment. Having a single pane of glass to easily view, search, and query all information being produced within your enviornment is hugely important for identifying and triaging security issues. The SIEM is truely the backbone of any enviornments security posture.

Once we have our log aggregation, we can begin to build out additional functionality to help better utilize the telemetry we recieve.

### Architecture

This was something that I had a bit of trouble understanding initally when planning my setup. There is a somehwat intrecate integration between Wazuh and Graylog.

So our Wazuh Indexer is the backend of our EDR, we will integrate it in such a way that it is the backend of Graylog. So all of our logs that hit Graylog will be stored in our Indexer.

Graylog will also be recieving all of the logs going through the Wazuh manager. We will use a tool called fluent bit to just sent the Wazuh alerts.log file to Graylog as it is changed. There are a few alternatives to fluent bit but this was the one I came accross when doing my setup and it works great. Graylog uses an opensearch/elasticsearch backend but instead of using the built in graylog backend, we make the Wazuh Indexer our backend instead. This is another step in integrating Graylog in with Wazuh as we do not want to store logs twice.

So SOCFortress and Grafana are our main like analysis tools that we look at to get a broad idea of what is going on in our enviornment and to quickly identify issues to investigate further. Once we do identify something, we could dive into graylog to get more context around the time of the alert. We may also want to access the host that generated the alert to investigate on that machine (Velociraptor, RMM tooling, or other incident response tools, super cool but we will not discuss them here).

![SIEM Architecture Diagram](https://koleada.github.io/Koles_Portfolio/images/SIEM.drawio.png)

### Wazuh Setup

In this section, we will go over the Wazuh setup. Its mostly straight forward with a few small nuances.

First, we clone the repo:

```
git clone https://github.com/wazuh/wazuh-docker.git -b v4.14.4
```

Once we have that, we want to generate certificates for Wazuh, however, we do not want the certificates to use the container names, we want want to add our host IP as well. Its certianly possible to get the proper certificate trusts using just the contianer names, but I prefer having the host IP in the certificate as well.

```
cd wazuh-docker/single-node/config

nano certs.yml
```

Edit certs.yml to be:

```
nodes:
  # Wazuh indexer server nodes
  indexer:
    - name: wazuh.indexer
      ip: <INDEXER_IP>

  # Wazuh server nodes
  # Use node_type only with more than one Wazuh manager
  server:
    - name: wazuh.manager
      ip: <MANAGER_IP>

  # Wazuh dashboard node
  dashboard:
    - name: wazuh.dashboard
      ip: <DASHBOARD_IP>
```

Note this config expects everything to be on the same machine, if that is not the case, stuff will have to change.

This part is super necessary, do not skip it, your install will break. I believe this basically makes the indexer advertise as elasticsearch instead of opensearch. That could be very wrong but in all honesty the time it took me to figure this out makes me not even care about what this line does. All I know is that for this setup to work it must be removed, kapish?

```
cd wazuh_indexer

nano wazuh.indexer.yml
```

Find and remove the following line:

```
compatibility.override_main_response_version: true
```

Once that is completed, we can go ahead and generate the certificates.

```
cd ../../

docker compose -f generate-indexer-certs.yml run --rm generator
```

Composing that container will generate our certificates in the single-node/config/wazuh_indexer_ssl_certs directory.

Before we proceed, if you want to change any of the default Wazuh passwords (trust me you want to), that should be done now. Follow the [Wazuh Documentation](https://documentation.wazuh.com/current/deployment-options/docker/changing-default-password.html). Unfortauntly, password changes in Wazuh are not as easy as most would like them to be. However, Wazuh does provide great documentation and walks you through exactly how to do it. If you were to wait until after your setup was complete before changing passwords (like I did) you will have to regenerate certificates and reconfigure graylog, so trust me its better to do that now.

### SIEM Docker Compose File

Now that we have our certificates created (and hopefully passwords changed), we can go ahead and set up our Docker compose file. Much of this is just the standard Wazuh docker compose file, but we also define our graylog instance here too.

Be sure to carefully go through this compose file and change all of the values in <> tags. This will break your setup if the values are not set properly.

You will want to keep the default wazuh compose file but just add the graylog and mongo sections to it so it looks like the below:

I do also recommend maybe using my mappings to avoid conflicts, lots of stuff wants to run on 443, I personally have MISP running on 443, SocFortress on 8080, Wazuh web ui on 55601 (because I barely need it anyways) but again totally up to you. Just know between CoPilot and Wazuh something will need to be changed.

Again if you used different passwords, be sure those are properly set in this compose file.

```
services:
  wazuh.manager:
    image: wazuh/wazuh-manager:4.14.3
    hostname: wazuh.manager
    restart: always
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 655360
        hard: 655360
    ports:
      - "1514:1514"
      - "1515:1515"
      - "514:514/udp"
      - "55000:55000"
    environment:
      - INDEXER_URL=https://wazuh.indexer:9200
      - INDEXER_USERNAME=admin
      - INDEXER_PASSWORD=SecretPassword
      - FILEBEAT_SSL_VERIFICATION_MODE=full
      - SSL_CERTIFICATE_AUTHORITIES=/etc/ssl/root-ca.pem
      - SSL_CERTIFICATE=/etc/ssl/filebeat.pem
      - SSL_KEY=/etc/ssl/filebeat.key
      - API_USERNAME=wazuh-wui
      - API_PASSWORD=MyS3cr37P450r.*-
    volumes:
      - wazuh_api_configuration:/var/ossec/api/configuration
      - wazuh_etc:/var/ossec/etc
      - wazuh_logs:/var/ossec/logs
      - wazuh_queue:/var/ossec/queue
      - wazuh_var_multigroups:/var/ossec/var/multigroups
      - wazuh_integrations:/var/ossec/integrations
      - wazuh_active_response:/var/ossec/active-response/bin
      - wazuh_agentless:/var/ossec/agentless
      - wazuh_wodles:/var/ossec/wodles
      - filebeat_etc:/etc/filebeat
      - filebeat_var:/var/lib/filebeat
      - ./config/wazuh_indexer_ssl_certs/root-ca-manager.pem:/etc/ssl/root-ca.pem
      - ./config/wazuh_indexer_ssl_certs/wazuh.manager.pem:/etc/ssl/filebeat.pem
      - ./config/wazuh_indexer_ssl_certs/wazuh.manager-key.pem:/etc/ssl/filebeat.key
      - ./config/wazuh_cluster/wazuh_manager.conf:/wazuh-config-mount/etc/ossec.conf

  wazuh.indexer:
    image: wazuh/wazuh-indexer:4.14.3
    hostname: wazuh.indexer
    restart: always
    ports:
      - "9200:9200"
    networks:
      default:
        aliases:
          - wazuh.indexer
    environment:
      # change as needed
      - "OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g"
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    volumes:
      - wazuh-indexer-data:/var/lib/wazuh-indexer
      - ./config/wazuh_indexer_ssl_certs/root-ca.pem:/usr/share/wazuh-indexer/config/certs/root-ca.pem
      - ./config/wazuh_indexer_ssl_certs/wazuh.indexer-key.pem:/usr/share/wazuh-indexer/config/certs/wazuh.indexer.key
      - ./config/wazuh_indexer_ssl_certs/wazuh.indexer.pem:/usr/share/wazuh-indexer/config/certs/wazuh.indexer.pem
      - ./config/wazuh_indexer_ssl_certs/admin.pem:/usr/share/wazuh-indexer/config/certs/admin.pem
      - ./config/wazuh_indexer_ssl_certs/admin-key.pem:/usr/share/wazuh-indexer/config/certs/admin-key.pem
      - ./config/wazuh_indexer/wazuh.indexer.yml:/usr/share/wazuh-indexer/config/opensearch.yml
      - ./config/wazuh_indexer/internal_users.yml:/usr/share/wazuh-indexer/config/opensearch-security/internal_users.yml

  wazuh.dashboard:
    image: wazuh/wazuh-dashboard:4.14.3
    hostname: wazuh.dashboard
    restart: always
    ports:
      - 55601:5601
    environment:
      - INDEXER_USERNAME=admin
      - INDEXER_PASSWORD=SecretPassword
      - WAZUH_API_URL=https://wazuh.manager
      - DASHBOARD_USERNAME=kibanaserver
      - DASHBOARD_PASSWORD=kibanaserver
      - API_USERNAME=wazuh-wui
      - API_PASSWORD=MyS3cr37P450r.*-
    volumes:
      - ./config/wazuh_indexer_ssl_certs/wazuh.dashboard.pem:/usr/share/wazuh-dashboard/certs/wazuh-dashboard.pem
      - ./config/wazuh_indexer_ssl_certs/wazuh.dashboard-key.pem:/usr/share/wazuh-dashboard/certs/wazuh-dashboard-key.pem
      - ./config/wazuh_indexer_ssl_certs/root-ca.pem:/usr/share/wazuh-dashboard/certs/root-ca.pem
      - ./config/wazuh_dashboard/opensearch_dashboards.yml:/usr/share/wazuh-dashboard/config/opensearch_dashboards.yml
      - ./config/wazuh_dashboard/wazuh.yml:/usr/share/wazuh-dashboard/data/wazuh/config/wazuh.yml
      - wazuh-dashboard-config:/usr/share/wazuh-dashboard/data/wazuh/config
      - wazuh-dashboard-custom:/usr/share/wazuh-dashboard/plugins/wazuh/public/assets/custom
    depends_on:
      - wazuh.indexer
    links:
      - wazuh.indexer:wazuh.indexer
      - wazuh.manager:wazuh.manager

  mongodb:
    image: "mongo:5.0"
    volumes:
      - "mongodb_data:/data/db"
    ports:
      - "27017:27017"
    restart: "on-failure"

  graylog:
    hostname: "server"
    image: "graylog/graylog:6.2"
    user: "0:0"
    extra_hosts:
      - "wazuh-indexer:127.0.0.1"
    environment:
      GRAYLOG_NODE_ID_FILE: "/usr/share/graylog/data/config/node-id"
      GRAYLOG_PASSWORD_SECRET: "${GRAYLOG_PASSWORD_SECRET:?Please configure GRAYLOG_PASSWORD_SECRET in the .env file}"
      GRAYLOG_ROOT_PASSWORD_SHA2: "${GRAYLOG_ROOT_PASSWORD_SHA2:?Please configure GRAYLOG_ROOT_PASSWORD_SHA2 in the .env file}"
      GRAYLOG_HTTP_BIND_ADDRESS: "0.0.0.0:9000"
      GRAYLOG_HTTP_EXTERNAL_URI: "https://<IP_OR_HOST>:9000/"
      GRAYLOG_ELASTICSEARCH_HOSTS: "https://admin:<ADMIN_PASS>@<INDEXER_IP>:9200"
      GRAYLOG_ELASTICSEARCH_SSL_ENABLED: "true"
      GRAYLOG_ELASTICSEARCH_SSL_CERTIFICATE_AUTHORITIES: "/etc/ssl/certs/wazuh-root-ca.pem"
      GRAYLOG_MONGODB_URI: "mongodb://mongodb:27017/graylog"
      GRAYLOG_HTTP_PUBLISH_URI: "https://<IP_OR_HOST>:9000/"

      # enable HTTPS
      GRAYLOG_SERVER_JAVA_OPTS: "-Djava.net.preferIPv4Stack=true -Djavax.net.ssl.trustStore=/truststore/opensearch.jks -Djavax.net.ssl.trustStorePassword=changeit"
      GRAYLOG_HTTP_ENABLE_TLS: "true"
      GRAYLOG_HTTP_TLS_CERT_FILE: "/usr/share/graylog/data/config/certs/public.pem"
      GRAYLOG_HTTP_TLS_KEY_FILE: "/usr/share/graylog/data/config/certs/private.key"

    ports:
      - "5044:5044/tcp"   # Beats
      - "5140:5140/udp"   # Syslog
      - "5140:5140/tcp"   # Syslog
      - "5555:5555/tcp"   # RAW TCP
      - "5555:5555/udp"   # RAW TCP
      - "9000:9000/tcp"   # Server API
      - "12201:12201/tcp" # GELF TCP
      - "12201:12201/udp" # GELF UDP
      - "5556:5556/udp"   # pfSense
      - "5557:5557/udp"   # Suricata
    #- "10000:10000/tcp" # Custom TCP port
    #- "10000:10000/udp" # Custom UDP port
      - "13301:13301/tcp" # Forwarder data
      - "13302:13302/tcp" # Forwarder config
    volumes:
      - "graylog_data:/usr/share/graylog/data/data"
      - "graylog_journal:/usr/share/graylog/data/journal"
      - "./config/wazuh_indexer_ssl_certs/root-ca.pem:/etc/ssl/certs/wazuh-root-ca.pem:ro"
      - "./graylog/truststore:/truststore"
      - "./graylog/certs:/usr/share/graylog/data/config/certs:ro"
      - "./graylog/tls:/opt/graylog/tls:ro"
    restart: "on-failure"

volumes:
  mongodb_data:
  os_data:
  graylog_data:
  graylog_journal:
  wazuh_api_configuration:
  wazuh_etc:
  wazuh_logs:
  wazuh_queue:
  wazuh_var_multigroups:
  wazuh_integrations:
  wazuh_active_response:
  wazuh_agentless:
  wazuh_wodles:
  filebeat_etc:
  filebeat_var:
  wazuh-indexer-data:
  wazuh-dashboard-config:
  wazuh-dashboard-custom:
```

### Graylog .env

Once thats done, I create directory for our Truststore volume(from inside of the single node directory):

```bash
mkdir -p ./graylog/truststore
```

After that we need to work on getting a couple Graylog enviornment variables configured.

```bash
//generate GRAYLOG_PASSWORD_SECRET:
sudo apt install pwgen
pwgen -N 1 -s 96

//generate GRAYLOG_ROOT_PASSWORD_SHA2:
echo -n "Enter Password: " && head -1 </dev/stdin | tr -d '\n' | sha256sum | cut -d" " -f1
```

We then want to drop these files into the basic graylog .env file(again from single node directory):

```bash
nano .env
```

We want to add the following to our .env file:

```
# You MUST set a secret to secure/pepper the stored user passwords here. Use at least 64 characters.
# Generate one by using for example: pwgen -N 1 -s 96
# ATTENTION: This value must be the same on all Graylog nodes in the cluster.
# Changing this value after installation will render all user sessions and encrypted values in the database invalid. (e.g. encrypted access tokens)
GRAYLOG_PASSWORD_SECRET="<PASSWORD>"

# You MUST specify a hash password for the root user (which you only need to initially set up the
# system and in case you lose connectivity to your authentication backend)
# This password cannot be changed using the API or via the web interface. If you need to change it,
# modify it in this file.
# Create one by using for example: echo -n yourpassword | shasum -a 256
# and put the resulting hash value into the following line
# CHANGE THIS!
GRAYLOG_ROOT_PASSWORD_SHA2="<PASSWORD_HASH>"
GRAYLOG_ELASTICSEARCH_SSL_VERIFY_HOSTNAME="false"          -             ***TRY REMOVING THIS***
```

### Password Tests

Ok nice, thats a good start. At this point we want to see we've made some progress.

```
docker compose up -d
```

Also note, Graylog will not work here, it cannot communicate with its backend (our indexer) because it uses an SSL cert that Graylog does not yet trust (were getting there).

So as a quick mid point test we want to jump into Wazuh, if you use my mappings it will be on port 55601 (or the wazuh web ui will be on 443 by default). So in your browser go to:

```
https://<WAZUH_IP>:55601
```

Sign into Wazuh using the admin credentials we defined in our compose file. If you changed the password now is a great time to ensure the password was actually changed.

We should also test the Wazuh API user account if we changed the password for that too.

In a terminal that has access to cURL run the following while changing the password to be the one you set and the IP to your Wazuh Manager IP:

```
curl -k -u "wazuh-wui:<API_USER_PASS>" https://<WAZUH_MANAGER_IP>:55000/security/user/authenticate
```

That will return a giant token that like this:

```
{"data": {"token": "eyJhbGciOiJFUzUxMiIsInR5cCI6IkpXVCJ9......"}, "error": 0}
```

Copy that entire token and use it in the following command:

```
curl -k -H "Authorization: Bearer <FULL_TOKEN>" https://<WAZUH_MANAGER_IP>:55000
```

We should see some basic information about Wazuh like the version. If either password is not working, repeat the steps outlined in the Wazuh documentation to change the password properly, regenerate the certificates afterward.

### Generating Graylog TLS Certificates

Ok so now we need to secure our stakc by getting Graylog on HTTPS. We do not want plaintext traffic going over our network at all, but certaintly not for one of the foundational security tools in our enviornemnt.

We would need to go through most of this anyway to ensure Graylog trusts the Wazuh certificates so its not much extra work to get it on HTTPS.

From the single node directory run:

```
mkdir -p graylog/certs
cd graylog/certs
```

Now we needed to generate our Graylog's private key:

```
openssl genpkey -algorithm RSA -out private.key -pkeyopt rsa_keygen_bits:4096

chmod 664 private.key
```

Now we want to edit the .conf file we will use for our certificate. This is where we input the values we want in our certificate.

```
nano graylog-openssl.cnf
```

Here is an example configuration file, again replace the values in this to match your network:

Make sure you know what to put in the [ dn ] fields. For example, country must be 2 letters, more or less and youll get errors. Be careful and look stuff up if your unsure.

```
[ req ]
default_bits       = 4096
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = req_ext

[ dn ]
C  = <COUNTY>
ST = <STATE>
L  = <LOCALITY/CITY>
O  = <ORGANIZATION>
OU = <ORGANIZATIONAL_UNIT/DEPAARTMENT>
CN = <COMMON_NAME/MAIN_HOSTNAME>

[ req_ext ]
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = <MAIN_HOSTNAME>
DNS.2 = <SECONDARY_HOST>
IP.1  = <IP>
```

Ok with that we can move to create our Certificate Signing Request(CSR). This is the file we generate and send to our Certificate Authrotiy(CA) to get our certificate issued.

```
openssl req -new -key private.key -out graylog.csr -config graylog-openssl.cnf
```

With that we can have our Root CA sign our CSR to generate our certificate. We will be using the Wazuh Root CA here for simplicity. Be sure the file paths to the Wazuh Root CA are correct.

```
openssl x509 -req \
  -in graylog.csr \
  -CA ../../config/wazuh_indexer_ssl_certs/root-ca.pem \
  -CAkey ../../config/wazuh_indexer_ssl_certs/root-ca.key \
  -CAcreateserial \
  -out public.cert.pem \
  -days 825 \
  -sha256 \
  -extensions req_ext \
  -extfile graylog-openssl.cnf
```

Now we just want to copy the Wazuh Root CA into our graylog volume (the certs directory we are currently in) so we can trust it within Graylog. We also do this because we have to build a chain file which Graylog will use for TLS. We can do that by running the following:

```
cp ../../config/wazuh_indexer_ssl_certs/root-ca.pem public.chain.pem

cat public.cert.pem public.chain.pem > public.pem

chmod 664 public.pem
```

Now we just want to perform a quick verification to ensure our cert looks correct:

```
openssl x509 -in public.pem -text -noout | grep -A2 "Subject Alternative Name"
```

We now want to just add the following volumes to Graylog in our docker compose. So our Volumes for Graylog should look like this:

```
    volumes:
      - "graylog_data:/usr/share/graylog/data/data"
      - "graylog_journal:/usr/share/graylog/data/journal"
      - "./config/wazuh_indexer_ssl_certs/root-ca.pem:/etc/ssl/certs/wazuh-root-ca.pem:ro"
      - "./graylog/truststore:/truststore"
      - "./graylog/certs:/usr/share/graylog/data/config/certs:ro"
      - "./graylog/tls:/opt/graylog/tls:ro"
```

### Trusting the Root VA in Wazuh

Now we need to trust the Root CA in Wazuh so we can access the indexer.

First, restart the Graylog container so it sees the changes we made:

```
docker compose restart graylog
```

Then run the following to ensure our certificates exist within our container:

```
docker exec -it --user root single-node-graylog-1 ls -l /etc/ssl/certs/wazuh-root-ca.pem
```

Copy existing trusted certificates into our new truststore:

```
docker exec --user root -it single-node-graylog-1 cp /opt/java/openjdk/lib/security/cacerts /truststore/opensearch.jks
```

Now we get a shell on our Graylog container:

```
docker exec -it --user root single-node-graylog-1 bash
```

Now that we are in the container we just need to run the following to get the Root CA trusted:

```
/opt/java/openjdk/bin/keytool -importcert \
  -alias wazuh-root-ca \
  -file /etc/ssl/certs/wazuh-root-ca.pem \
  -keystore /truststore/opensearch.jks \
  -storepass changeit \
  -noprompt

/opt/java/openjdk/bin/keytool -list \
  -keystore /truststore/opensearch.jks \
  -storepass changeit
```

The output of that last command should see something that includes: wazuh-root-ca, trustedCertEntry. If thats the case we should be good to go.

Make sure you have the following envionrmnet variables in your compose file, and also make sure you change the publish URI and external URL to use https if they do not already:

```
      # enable HTTPS
      GRAYLOG_HTTP_ENABLE_TLS: "true"
      GRAYLOG_HTTP_TLS_CERT_FILE: "/usr/share/graylog/data/config/certs/public.pem"
      GRAYLOG_HTTP_TLS_KEY_FILE: "/usr/share/graylog/data/config/certs/private.key"
```

Now we can do one final:

```
exit (get out of Graylog container)

docker compose down graylog

docker compose up graylog -d
```

We should see all of our containers running and healthy. Also if you notice that you are not seeing much for logs in the Wazuh web UI do not be alarmed, this is normal. With our setup we will really only be using the Wazuh web UI to deploy rules and decoders (hopefully we get that functionality in Graylog at some point, if I have time I may look into adding this feature myself if its currently possible).

### Getting Logs Into Graylog

We will be using Fluent Bit or a similar tool to transport the logs in our alerts.log file to Graylog. The alerts.log file contains all of the logs that matched a rule defined in our Wazuh manager. Check out this blog post to setup fluent bit: [https://socfortress.medium.com/part-3-wazuh-manager-install-log-analysis-e819f28b0f9e](https://socfortress.medium.com/part-3-wazuh-manager-install-log-analysis-e819f28b0f9e). It also explains how to import all of the Wazuh rules easily which you can optionally do too. I would high recommend deploying sysmon on at least one endpoint running the Wazuh agent, and also deploying the Sysmon rules found here [https://github.com/socfortress/Wazuh-Rules](https://github.com/socfortress/Wazuh-Rules) to the Wazuh manager. We will need sysmon running and its rules deployed to see data in our dashboards that we will deploy soon.

Rules are what determine if a log will make it into the Wazuh alerts.log file, which is what fluent-bit sends to Graylog. So if a log does not make it there, it will not make it into Graylog, and thus will also not make it into our dashboards or in our SocFortress CoPilot alerts page.

If you have a firewall or other log generating devices/software you can also get those logs into Graylog via a similar procedure. Many technologies include syslog forwarding meaning you can configure them to send logs directly to Graylog. Alternatively, you can also just write a little script to poll some data source, and forward the data to Graylog. The options are endless here.

In my network I run a pfSense firewall which very easily allows the forwarding of system logs to remote servers via built in functionality. I also run [Suricata](https://suricata.io/) on my firewall. Those logs were a tiny bit tricker to get into Graylog. I ended up installing the syslog-ng package on the firewall and using that to forward the Suricata log file to Graylog. Note that you may have to write Graylog extractors to parse the logs into a nice Key:Value format. I believe Taylor Walton has one for pfSense logs online. I beleive the Suricata one I had to write myself.

Follow [this blog post](https://medium.com/@socfortress/part-5-intelligent-siem-logging-4d0656c0da5b) for information on setting up your Wazuh logs extractor in Graylog, this will parse the logs into a nice format. You will need to have an input running if you choose to make the extractor now. Creating an input is not a bad idea to test everything is working properly, but when we deploy the Graylog content pack in SocFortress CoPilot that will create an input.

### Adding SOCFortress CoPilot

OK now onto the final step, deploying SocFortress CoPilot. This is an amazing tool with a ton of functionality. It allows us to view and manage a lot of our security infrastructure in one place, and allows us to very quickly configure Graylog normalization and deploy some great Grafana dashboards.

There is some documentation and resources here, but even still I had a ton of issues getting this to work properly. Lots of issues with versions of all of the tooling, and issues with getting the Grafana dashboards working, issues getting agents to appear as beloning to a customer, etc. Do not misunderstand me, I am not complaining, I had fun figuring all of this out and I am so appreciative of the CoPilot devs. I just want to discuss my expierence and provide more context into why I believ ethis blog post is helpful and worth writting. I hope that this will elimiate these issues for others and hopefully make this tool and its developers get the recognition I think they deserve.

Again be sure you deploy sysmon (I recommend this config as a starting point: [https://github.com/SwiftOnSecurity/sysmon-config](https://github.com/SwiftOnSecurity/sysmon-config)) and also deploy at least the sysmon rules to Wazuh.

I'm not going to go over getting SocFortress running in much detail as it should be fairly straightforward. Clone the [repo](https://github.com/socfortress/CoPilot), follow the docs, point it to Graylog, Wazuh and Grafana, and thats really it. Grafana is kind of the same, it should be easy to get up and running, and in a bit I will tell you everything you have to do to make the SocFortress dashboard deployment be seamless. I used this Grafana image: grafana/grafana:10.4.1 so I would recommend just using that if you follow this guide to avoid any potetnial version mishaps. You must have above version 10.4.0 for Grafana. Honestly, I dont even know if the SocFortress .env even matters a ton, I think mine contains a bunch of old credentials, but since you can configure connectors in the CoPilot web UI I believe that overrides your .env. Just something to consider if you mess up the .env.

You can use this simple Grafana compose file below:

```
services:
  grafana:
    image: grafana/grafana:10.4.1
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: <PASSWORD>
      GF_AUTH_ANONYMOUS_ENABLED: "false"
      GF_SERVER_DOMAIN: "<IP>"
      GF_SERVER_ROOT_URL: "http://<IP>:3000/"
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: "*"
    volumes:
      - ./grafana/data:/var/lib/grafana
      # - ./grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/provisioning/datasources:/etc/grafana/provisioning/datasources
      - ./grafana/plugins:/var/lib/grafana/plugins
    restart: unless-stopped
```

### Provison CoPilot Customer

Ok cool, so now we should have Graylog recieving Wazuh logs via Fluent-Bit, Wazuh running properly, SocFortress running, and Grafana also running. Log into SocFortress and go to Connectors, you should make sure the connectors for Wazuh Indexer, Manager, and Graylog are all verified. They will only be verified once they have confirmed the services are live and accessible so make sure those things are running, and you provided the correct URL and credentials for each.

The first thing we must do is deploy the Graylog content pack. So log into SocFortress, select Tools > Stack Provisioning and then get that content pack deployed. This will gives us a ton of rules which normalize logs into the format Grafana expects. This also creates stream for Wazuh logs, an input that aligns with our Fluent-bit config, and an extractor too that parses Wazuh logs into a nice format. I personally chose to delete the stream created by the content pack, since I just have one customer I really only need one stream. If you created an input earlier too, you can optionally delete the one it created, again just make sure whatever input you have matches the fluent-bit config and has the proper extractor on it.

Ok cool, so for the dashboard deployment to work properly we must add a Opensearch datasource plugin to Grafana. Pretty self explanatory, this allows Grafana to use OpenSearch as a data sourse. If you are not aware, the Wazuh Indexer is built on OpenSearch.

So in the Grafana web UI just go to the three lines on the top left, then connections, search for Opensearch and then install that. Again you need Grafana >=10.4.0 for this thing to work.

I hate to admit this, but I ended up isntalling the plugin manually, because I did not see it in my Grafana instance, idk if I maybe had the wrong version at the time or just was looking in the wrong spot, but yea thats a bit of time I'll never get back xD.

Ok cool, with that we can provision our Customer in CoPilot. Pretty easy stuff here, [this video](https://www.youtube.com/watch?v=hC0JHY5WF-U) explains exactly how to do it.

Nice now we have a ton of working Grafana dashboards! Nope you dont, theres more to do.

Jump back into Graylog. We need to make sure the Wazuh input we made is pushing going to the Stream the customer provisoning just made. Streams can have rules, if a log matches the rule it gets taken our of the default stream and placed into the other stream. The customer provision creates a stream for the customer we made with a couple of rules. So on the customer stream in Graylog make sure u delete the cluster_node field unless you have a reason to keep it. Then we want to jump back to our Wazuh input, and add a static by going to more actions > add a static field. The field name should be agent_labels_customer and the value should be your customer code. When looking at the customer stream you will see a number in the rules column, you can click that to see the rules. You basically just want to add a static field to your input so the logs will contain that key:value and thus will be routed to your customer stream.

So basically what we just did was make it so everything going into the Wazuh input created by the content pack also goes into the Customer Stream created during the customer provisioning. Again this is totally fine for a single customer setup and just makes more sense, no reason to have multiple streams unless you have multiple customers.

Nice once you do that you should be seeing logs in your stream. You can check this by going to the input and hitting show recieved messages. When you click on the log you should be seeing them nice and parsed too, meaning they have many diffient fields with single values, you do not want to see giant blocks of messy text. If you do go back and put an extractor on your input, but going to your input hitting adding extractors and creating one based on the blog post I mentioned earlier. If you do deploy the content pack and use the input it creates you will not have to worry about creating your own extractor.

Ok cool surely now dashboards should work right? Nope, still more to do.

This one really confuses me. So if you expect your logs, you will see a field called rule_groups I believe, which contains a few comma separated values. Well in the dashboards you can see almost all queries use syntax like rule_group2 or rule_group3, etc. I belvie this is supposed to refer to the a specific value within that rule_groups field think of it like accessing a specific array index. The problem is it does not work whatsoever. Maybe this used to be valid syntax in prior version of opensearch or maybe someone changed the rules in the content pack, I do not know but it does not work at all, and causes all dashboards to fully break and display nothing. So we need to fix it ourselves.

I'm sure theres probably a better way to fix this, but heres what I did. So in Graylog, go to System > Pipelines, and select the Wazuh Processing Pipelines one that was created by the content pack. Then go to manage rules > create rule.

We bascially will create rules to convert the rule_groups: group1, group2, group3, etc into separate fields like rule_group1: group1, rule_group2: group2, etc. Again, its not pretty, but it works.

I'm not sure what the largest number of values in the rule_groups field is, but the most I saw was 4. So I created 5 rules, each on creates a rule_group<num> field up to 5 values in rule_groups.

So again, we just have to create 5 rules to start heres what each should look like:

From here we can begin to configure our SIEM which we will be going over in many future posts that will probably be more fun than this one. I hope you found this useful, I would love to hear from you with any questions, critiques, or comments, links to reach me are on the website. Thank you for reading.

```
rule "rule_groups Split #1"
when
  has_field("rule_groups")
then
  let cleaned = replace(to_string($message.rule_groups), ", ", ",");
  let g = split(",", cleaned);
  set_field("rule_group1", g[0]);
end


rule "rule_groups Split #2"
when
  has_field("rule_groups") && is_not_null(split(",", replace(to_string($message.rule_groups), ", ", ","))[1])
then
  let cleaned = replace(to_string($message.rule_groups), ", ", ",");
  let g = split(",", cleaned);
  set_field("rule_group2", g[1]);
end


rule "rule_groups Split #3"
when
  has_field("rule_groups") && is_not_null(split(",", replace(to_string($message.rule_groups), ", ", ","))[2])
then
  let cleaned = replace(to_string($message.rule_groups), ", ", ",");
  let g = split(",", cleaned);
  set_field("rule_group3", g[2]);
end


rule "rule_groups Split #4"
when
  has_field("rule_groups") && is_not_null(split(",", replace(to_string($message.rule_groups), ", ", ","))[3])
then
  let cleaned = replace(to_string($message.rule_groups), ", ", ",");
  let g = split(",", cleaned);
  set_field("rule_group4", g[3]);
end


rule "rule_groups Split #5"
when
  has_field("rule_groups") && is_not_null(split(",", replace(to_string($message.rule_groups), ", ", ","))[4])
then
  let cleaned = replace(to_string($message.rule_groups), ", ", ",");
  let g = split(",", cleaned);
  set_field("rule_group5", g[4]);
end
```

Once you have those 5 rules created, go back to Manage Pipelines, select teh Wazuh Processing Pipelines, and edit Stage 0. Hit the stage rules dropdown/search field and add all of the fields you just created. This will effectively break that rule_groups field into separate fields each with a single value and will allow the dashboards to actually work.

### Getting Agents to Appear For A Specific Customer

This is another thing that annoyed me for a while. I dont know if I just rushing through the CoPilot documentation and missed it, but I could not find how to make agents appear as belonging to a specifc customer.

The answer is to add the following to the Wazuh config file of your agents:

```xml
<labels>
  <label key="customer_code">YOUR_CODE</label>
</labels>
```

This could be added to specific agent configs, or to group configs. But this is how you will see your agents as belonging to a specific customer in CoPilot.

### Seeing High-Priority Alerts in CoPilot

Again CoPilot and Grafana are what we use to see inital evidence of security risks that require further triage and investigation. As such we want to be able to see alerts in CoPilot. Luckily CoPilot makes this very easy.

In CoPilot go to Graylog > Mangement > Alert Provisioning

Enable the Wazuh Syslog Level Alert. This will show all alerts that have an alert level of over 11 in CoPilot SIEM > Alerts page. The alert level is defined in the Wazzuh rule files. You can configure your own custom alerts here too which is very nice.

### Conclusion

Ok, I think we are done with the inital setup. In summary, we:

- Deployed Wazuh and Graylog
- Integrated Wazuh and Graylog
- Got Graylog to run on HTTPS and detailed how to change Wazuh passwords without wasting time
- Deployed SocFortress
- Deployed Grafana with the OpenSearch plugin
- Connected all deployment to SocFortress
- Deployed the SocFortress content pack to Graylog
- Created a SocFortress Customer and provisioned them
- Got the prebuilt Grafana dashboards to actually work
