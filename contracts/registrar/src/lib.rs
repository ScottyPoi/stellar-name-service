#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Error, IntoVal, Symbol,
};

mod keys {
    pub const REGISTRY: &[u8] = b"REG_ADDR";
    pub const TLD: &[u8] = b"REG_TLD";
    pub const PARAMS: &[u8] = b"REG_PARM";
    pub const ADMIN: &[u8] = b"REG_ADMN";
    pub const COMM: &[u8] = b"REG_COMM";
}

fn default_params() -> RegistrarParams {
    RegistrarParams {
        min_label_len: 1,
        max_label_len: 63,
        commit_min_age_secs: 60,
        commit_max_age_secs: 86_400,
        renew_extension_secs: 31_536_000,
        grace_period_secs: 7_776_000,
    }
}

fn singleton_key(env: &Env, tag: &[u8]) -> Bytes {
    Bytes::from_slice(env, tag)
}

fn commitment_key(env: &Env, commitment: &BytesN<32>) -> Bytes {
    let mut key = Bytes::from_slice(env, keys::COMM);
    key.extend_from_array(&commitment.to_array());
    key
}

fn read_registry(env: &Env) -> Address {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_tld(env: &Env) -> Bytes {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::TLD);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_admin(env: &Env) -> Address {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::ADMIN);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_params(env: &Env) -> RegistrarParams {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::PARAMS);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn write_params(env: &Env, params: &RegistrarParams) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::PARAMS);
    storage.set(&key, params);
}

fn write_registry(env: &Env, registry: &Address) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    storage.set(&key, registry);
}

fn write_tld(env: &Env, tld: &Bytes) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::TLD);
    storage.set(&key, tld);
}

fn write_admin(env: &Env, admin: &Address) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::ADMIN);
    storage.set(&key, admin);
}

fn validate_label(env: &Env, label: &Bytes) {
    let params = read_params(env);
    let len = label.len();
    if len < params.min_label_len || len > params.max_label_len {
        panic_with_error!(env, RegistrarError::InvalidLabel);
    }
}

fn compute_commitment(env: &Env, label: &Bytes, owner: &Address, secret: &Bytes) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(label);
    let owner_bytes = owner.clone().to_xdr(env);
    data.append(&owner_bytes);
    data.append(secret);
    env.crypto().sha256(&data).to_bytes()
}

fn fold_hash(env: &Env, parent: &BytesN<32>, label_hash: &BytesN<32>) -> BytesN<32> {
    let mut data = Bytes::from_array(env, &parent.to_array());
    data.extend_from_array(&label_hash.to_array());
    env.crypto().sha256(&data).to_bytes()
}

fn compute_namehash(env: &Env, label: &Bytes) -> BytesN<32> {
    let tld = read_tld(env);
    let root = BytesN::<32>::from_array(env, &[0u8; 32]);
    let tld_hash = env.crypto().sha256(&tld).to_bytes();
    let node = fold_hash(env, &root, &tld_hash);
    let label_hash = env.crypto().sha256(label).to_bytes();
    fold_hash(env, &node, &label_hash)
}

fn commitment_timestamp(env: &Env, commitment: &BytesN<32>) -> Option<u64> {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.get(&key)
}

fn store_commitment(env: &Env, commitment: &BytesN<32>, ts: u64) {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.set(&key, &ts);
}

fn remove_commitment(env: &Env, commitment: &BytesN<32>) {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.remove(&key);
}

fn ensure_initialized(env: &Env) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    if !storage.has(&key) {
        panic_with_error!(env, RegistrarError::NotInitialized);
    }
}

fn ensure_admin(env: &Env, caller: &Address) {
    let admin = read_admin(env);
    if admin != *caller {
        panic_with_error!(env, RegistrarError::NotAdmin);
    }
}

fn grace_expired(now: u64, expires_at: u64, grace: u64) -> bool {
    if now <= expires_at {
        return false;
    }
    let grace_end = expires_at.checked_add(grace).unwrap_or(u64::MAX);
    now > grace_end
}

mod registry_api {
    use super::*;

    pub fn set_owner(env: &Env, registry: &Address, namehash: &BytesN<32>, owner: &Address) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "set_owner"),
            (namehash, owner).into_val(env),
        );
    }

    pub fn set_resolver(env: &Env, registry: &Address, namehash: &BytesN<32>, resolver: &Address) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "set_resolver"),
            (namehash, resolver).into_val(env),
        );
    }

    pub fn renew(env: &Env, registry: &Address, namehash: &BytesN<32>) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "renew"),
            (namehash,).into_val(env),
        );
    }

    pub fn owner(env: &Env, registry: &Address, namehash: &BytesN<32>) -> Option<Address> {
        let args = (namehash.clone(),).into_val(env);
        match env.try_invoke_contract::<Address, Error>(&registry, &Symbol::new(env, "owner"), args)
        {
            Ok(Ok(address)) => Some(address),
            _ => None,
        }
    }

    pub fn expires(env: &Env, registry: &Address, namehash: &BytesN<32>) -> Option<u64> {
        let args = (namehash.clone(),).into_val(env);
        match env.try_invoke_contract::<u64, Error>(&registry, &Symbol::new(env, "expires"), args) {
            Ok(Ok(ts)) => Some(ts),
            _ => None,
        }
    }
}

/// Registrar contract for the `.stellar` namespace.
/// Provides commit–reveal registration, renewals, and availability checks.
/// Interacts with the Registry (and optionally Resolver) contracts.
#[contract]
pub struct Registrar;

#[contracttype]
#[derive(Clone)]
pub struct RegistrarParams {
    pub min_label_len: u32,
    pub max_label_len: u32,
    pub commit_min_age_secs: u64,
    pub commit_max_age_secs: u64,
    pub renew_extension_secs: u64,
    pub grace_period_secs: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistrarError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAdmin = 3,
    NotOwner = 4,
    InvalidLabel = 5,
    CommitmentExists = 6,
    CommitmentMissingOrStale = 7,
    NameNotAvailable = 8,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtCommitMade {
    pub commitment: BytesN<32>,
    pub at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtNameRegistered {
    pub namehash: BytesN<32>,
    pub owner: Address,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtNameRenewed {
    pub namehash: BytesN<32>,
    pub expires_at: u64,
}

#[contractimpl]
impl Registrar {
    pub fn init(env: Env, _registry: Address, _tld: Bytes, _admin: Address) {
        // TODO: Implement initialization logic
    }

    pub fn commit(env: Env, _caller: Address, _commitment: BytesN<32>) {
        // TODO: Store commitment with timestamp; emit EvtCommitMade
    }

    pub fn register(
        env: Env,
        _caller: Address,
        _label: Bytes,
        _owner: Address,
        _secret: Bytes,
        _resolver: Option<Address>,
    ) -> BytesN<32> {
        // TODO: Verify commitment, check availability, set owner in Registry, emit event
        BytesN::from_array(&env, &[0u8; 32])
    }

    pub fn renew(env: Env, _caller: Address, _label: Bytes) {
        // TODO: Extend expiry in Registry; emit EvtNameRenewed
    }

    pub fn available(env: Env, _label: Bytes) -> bool {
        // TODO: Query Registry and determine availability
        false
    }

    pub fn registry(env: Env) -> Address {
        // TODO: Return stored Registry address
        Address::random(&env)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_placeholder() {
        let env = Env::default();
        let admin = Address::random(&env);
        let registry = Address::random(&env);
        let tld = Bytes::from_slice(&env, b"stellar");
        Registrar::init(env.clone(), registry, tld, admin);
        // TODO: Expand unit tests once logic is implemented
    }
}
